// Pure accounting, never an entitlement. Rates and FX must come from a reviewed,
// server-owned tariff snapshot, NOT request parameters or a model's answer.
// No default prices: model aliases, tiers and provider prices can change.
export type ResponseUsage = {
  responseId: string; model: string; tier: string;
  input: number; cachedInput: number; output: number; webSearchCalls: number;
  audioInput?: number;
};
export type InferenceTariff = {
  id: string; model: string; tier: string; validFrom: string; validUntil: string;
  // Integer billionths of USD per token / tool call.
  inputNanoUsd: number; cachedInputNanoUsd: number;
  outputNanoUsd: number; webSearchNanoUsd: number;
  audioInputNanoUsd?: number;
  // Refuse long-context schedules rather than silently applying short rates.
  maxInputTokens: number;
};
export type ExchangeSnapshot = {
  id: string; validFrom: string; validUntil: string;
  // EUR per USD, as an exact positive rational. No USD=EUR fallback.
  eurNumerator: number; usdDenominator: number;
};
const invalid = (): never => { throw Error('USAGE_UNCONFIRMED'); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
function positive(value: unknown): number {
  const number = integer(value); if (!number) return invalid(); return number;
}
function safe(value: bigint): number {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('COST_OVERFLOW');
  return Number(value);
}
function ceil(n: bigint, d: bigint) { return (n + d - BigInt(1)) / d; }
function validAt(snapshot: {id: string; validFrom: string; validUntil: string}, at: number) {
  const start = Date.parse(snapshot.validFrom), end = Date.parse(snapshot.validUntil);
  if (!snapshot.id || !Number.isFinite(at) || !Number.isFinite(start) || !Number.isFinite(end) ||
      end <= start || at < start || at >= end) throw Error('TARIFF_EXPIRED');
}

// Use terminal provider usage even when the answer is refused/incomplete. Output
// tokens ALREADY include reasoning: adding reasoning_tokens would double-charge.
// Search content must be included in provider input usage. Do not use this parser
// for models with separately billed/fixed search-content blocks or audio usage.
export function readResponseUsage(raw: unknown): ResponseUsage {
  const response = object(raw), usage = object(response.usage);
  if (!['completed', 'incomplete', 'failed', 'cancelled'].includes(String(response.status)) ||
      typeof response.id !== 'string' || !/^resp_[A-Za-z0-9_-]+$/.test(response.id) ||
      typeof response.model !== 'string' || !response.model ||
      typeof response.service_tier !== 'string' || !response.service_tier ||
      !Array.isArray(response.output)) return invalid();
  const input = integer(usage.input_tokens), output = integer(usage.output_tokens);
  const cachedInput = integer(object(usage.input_tokens_details).cached_tokens);
  if (cachedInput > input || BigInt(integer(usage.total_tokens)) !== BigInt(input) + BigInt(output)) return invalid();
  const details = object(usage.output_tokens_details);
  if (integer(details.reasoning_tokens) > output) return invalid();
  // Cache-write / multimodal pricing requires a dedicated adapter. Unknown
  // nonzero breakdowns are never treated as free input/output.
  for (const [key, value] of Object.entries(object(usage.input_tokens_details))) {
    if (key !== 'cached_tokens' && value !== 0 && value !== null) return invalid();
  }
  for (const [key, value] of Object.entries(details)) {
    if (key !== 'reasoning_tokens' && value !== 0 && value !== null) return invalid();
  }
  let webSearchCalls = 0;
  const ids = new Set<string>();
  for (const item of response.output) {
    const part = object(item);
    if (!['message', 'reasoning', 'web_search_call'].includes(String(part.type))) return invalid();
    if (part.type === 'web_search_call') {
      if (typeof part.id !== 'string' || !part.id || ids.has(part.id) || part.status !== 'completed') return invalid();
      ids.add(part.id); webSearchCalls++;
    }
  }
  return {responseId: response.id, model: response.model, tier: response.service_tier,
    input, cachedInput, output, webSearchCalls};
}

export function responseCostNanoUsd(usage: ResponseUsage, tariff: InferenceTariff, at: number): bigint {
  validAt(tariff, at);
  if (usage.model !== tariff.model || usage.tier !== tariff.tier) throw Error('TARIFF_MISMATCH');
  const input = integer(usage.input), cached = integer(usage.cachedInput);
  const audio = integer(usage.audioInput ?? 0);
  if (audio > input - cached) throw Error('USAGE_UNCONFIRMED');
  if (cached > input || input > positive(tariff.maxInputTokens)) throw Error('CONTEXT_PRICE_UNCONFIRMED');
  const inputRate = integer(tariff.inputNanoUsd), cachedRate = integer(tariff.cachedInputNanoUsd);
  if (cachedRate > inputRate) throw Error('TARIFF_MISMATCH');
  return BigInt(input - cached - audio) * BigInt(inputRate) + BigInt(audio) * BigInt(audio ? positive(tariff.audioInputNanoUsd!) : 0) + BigInt(cached) * BigInt(cachedRate) +
    BigInt(integer(usage.output)) * BigInt(integer(tariff.outputNanoUsd)) +
    BigInt(integer(usage.webSearchCalls)) * BigInt(integer(tariff.webSearchNanoUsd));
}

export function quoteMeteredRequest(
  receipts: {usage: ResponseUsage; tariff: InferenceTariff; startedAt: number}[],
  exchange: ExchangeSnapshot, requestStartedAt: number,
) {
  if (!receipts.length) throw Error('USAGE_UNCONFIRMED');
  validAt(exchange, requestStartedAt);
  const ids = new Set<string>(); let nanoUsd = BigInt(0);
  for (const receipt of receipts) {
    if (!receipt.usage.responseId || ids.has(receipt.usage.responseId)) throw Error('DUPLICATE_RECEIPT');
    ids.add(receipt.usage.responseId);
    nanoUsd += responseCostNanoUsd(receipt.usage, receipt.tariff, receipt.startedAt);
  }
  const numerator = nanoUsd * BigInt(positive(exchange.eurNumerator));
  const denominator = BigInt(positive(exchange.usdDenominator));
  // Keep exact precision across models, tools and FX. Round only the final debit.
  const customerBaseCents = safe(ceil(numerator * BigInt(3), denominator * BigInt(10_000_000)));
  return {providerCostNanoUsd: nanoUsd.toString(), exchangeId: exchange.id,
    providerCostEuroMicros: safe(ceil(numerator, denominator * BigInt(1000))),
    customerBaseCents, currency: 'eur' as const, taxIncluded: false as const,
    tariffIds: receipts.map(receipt => receipt.tariff.id)};
}

export type StageBudget = {tariff: InferenceTariff; maxInput: number; maxOutput: number; maxWebSearchCalls: number};
// maxInput must be a hard provider/context bound, including tool-added input,
// not a character estimate. Models/tools without such a bound stay blocked.
export function quoteReservation(stages: StageBudget[], exchange: ExchangeSnapshot, at: number) {
  return quoteMeteredRequest(stages.map((stage, index) => ({
    tariff: stage.tariff.audioInputNanoUsd ? {...stage.tariff,inputNanoUsd:Math.max(stage.tariff.inputNanoUsd,stage.tariff.audioInputNanoUsd)} : stage.tariff, startedAt: at,
    usage: {responseId: `ceiling_${index}`, model: stage.tariff.model, tier: stage.tariff.tier,
      input: integer(stage.maxInput), cachedInput: 0, output: integer(stage.maxOutput),
      webSearchCalls: integer(stage.maxWebSearchCalls)},
  })), exchange, at);
}

// Audio JSON has no response/model identifier. Bind usage to the HTTP request-id
// and the exact server-selected model; never manufacture a provider receipt ID.
export function readTranscriptionUsage(raw: unknown, requestId: string, model: string): ResponseUsage {
  const usage = object(object(raw).usage), detail = object(usage.input_token_details);
  if (usage.type !== 'tokens' || !/^req_[A-Za-z0-9_-]+$/.test(requestId)) return invalid();
  const input = integer(usage.input_tokens), audioInput = integer(detail.audio_tokens), text = integer(detail.text_tokens);
  const output = integer(usage.output_tokens);
  if (audioInput + text !== input || integer(usage.total_tokens) !== input + output) return invalid();
  for (const [key,value] of Object.entries(detail)) if (!['audio_tokens','text_tokens'].includes(key) && value !== 0 && value !== null) return invalid();
  return {responseId:requestId,model,tier:'default',input,audioInput,cachedInput:0,output,webSearchCalls:0};
}
