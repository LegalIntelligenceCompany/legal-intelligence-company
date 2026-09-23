import {quoteMeteredRequest, quoteReservation, readResponseUsage, type ExchangeSnapshot, type StageBudget} from './inference-cost';

// Contract for a durable, server-only ledger adapter. reserve must authenticate
// membership and subscription, atomically lock funds and reject reused IDs.
// settle must atomically debit exactly once and release the unused reservation.
// Neither operation may trust browser-supplied balances, costs or tariff IDs.
export type InferenceLedger = {
  environment: 'test' | 'live';
  reserve(request: {id: string; actorId: string; walletId: string; ceilingCents: number;
    tariffIds: string[]; exchangeId: string}): Promise<void>;
  record(request: {id: string; stage: number; receipt: ReturnType<typeof readResponseUsage>}): Promise<void>;
  settle(request: {id: string; customerBaseCents: number; providerCostNanoUsd: string;
    exchangeId: string}): Promise<void>;
};

// This engine has NO live adapter yet. Do not use the prepaid_test wallet for
// actual inference. Deployment of this file alone never enables paid access.
export async function executeMeteredRequest<T>(options: {
  id: string; actorId: string; walletId: string;
  stages: StageBudget[]; exchange: ExchangeSnapshot; ledger: InferenceLedger;
  providerEnvironment: 'mock' | 'live';
  // Called once per stage, only after reserve has succeeded. The adapter must
  // enforce the exact model/tier/context/tool/output bounds from StageBudget.
  invoke(stage: StageBudget, index: number, previous: unknown[]): Promise<unknown>;
  format(responses: unknown[]): T;
  now?: () => number;
}) {
  if (options.providerEnvironment === 'live' && options.ledger.environment !== 'live') {
    throw Error('SANDBOX_CANNOT_FUND_INFERENCE');
  }
  if (!options.id || !options.actorId || !options.walletId || !options.stages.length) throw Error('INVALID_REQUEST');
  const now = options.now ?? Date.now;
  const startedAt = now();
  // Freeze caller-owned configuration before the first async boundary.
  const stages = structuredClone(options.stages), exchange = structuredClone(options.exchange);
  const ceiling = quoteReservation(stages, exchange, startedAt);
  if (ceiling.customerBaseCents <= 0) throw Error('INVALID_RESERVATION');
  await options.ledger.reserve({id: options.id, actorId: options.actorId, walletId: options.walletId,
    ceilingCents: ceiling.customerBaseCents, tariffIds: stages.map(stage => stage.tariff.id), exchangeId: exchange.id});
  const responses: unknown[] = [];
  const receipts: Parameters<typeof quoteMeteredRequest>[0] = [];
  for (let index = 0; index < stages.length; index++) {
    const stage = stages[index], stageStartedAt = now();
    // A tariff may expire while a previous stage is executing. Check again
    // BEFORE sending another chargeable request, not only after its response.
    quoteReservation([stage], exchange, stageStartedAt);
    // No catch/retry/release on uncertain outcomes: keep the durable hold for
    // reconciliation. A timeout does not prove the provider did not charge.
    const raw = await options.invoke(structuredClone(stage), index, responses.slice());
    const usage = readResponseUsage(raw);
    if (usage.input > stage.maxInput || usage.output > stage.maxOutput || usage.webSearchCalls > stage.maxWebSearchCalls) {
      throw Error('PROVIDER_BUDGET_EXCEEDED');
    }
    const receipt = {usage, tariff: stage.tariff, startedAt: stageStartedAt};
    // Validate model/tier before persisting a billable receipt.
    quoteMeteredRequest([receipt], exchange, startedAt);
    await options.ledger.record({id: options.id, stage: index, receipt: usage});
    receipts.push(receipt); responses.push(raw);
  }
  const cost = quoteMeteredRequest(receipts, exchange, startedAt);
  if (cost.customerBaseCents > ceiling.customerBaseCents) throw Error('PROVIDER_BUDGET_EXCEEDED');
  // Persist the charge before exposing a result. If persistence is uncertain,
  // never start again. Recovery must read the durable reservation/receipts.
  await options.ledger.settle({id: options.id, customerBaseCents: cost.customerBaseCents,
    providerCostNanoUsd: cost.providerCostNanoUsd, exchangeId: exchange.id});
  return {result: options.format(responses), cost};
}
