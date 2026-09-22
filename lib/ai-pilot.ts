import type { createAdminClient } from './supabase/admin';

export const PILOT_EMAIL = 'legalintelligencecompany@gmail.com';
export const PILOT_MODEL = 'gpt-5-mini';
export const PILOT_EXPIRES = '2026-09-29T23:59:59Z';
export const PILOT_RESERVES = { research: 150, document: 60, analysis: 130, transcription: 20 } as const;
export type PilotKind = keyof typeof PILOT_RESERVES;
export const pilotMessages: Record<string, string> = {
 PILOT_SETUP: 'Falta preparar o orçamento de teste em /setup/pilot. Não foi iniciada uma chamada paga.',
 PILOT_EXHAUSTED: 'O saldo reservado do teste não chega para este pedido. Não foi iniciada outra chamada paga.',
 PILOT_EXPIRED: 'O período de teste terminou. Não foi iniciada outra chamada paga.',
 PILOT_FORBIDDEN: 'Este teste pago está reservado à conta autorizada.',
 PILOT_DUPLICATE: 'Este pedido já tem orçamento reservado. Não foi repetido.',
 PILOT_AUDIO: 'Neste teste económico, carregue um WAV PCM de 16 bits, mono ou estéreo, até 60 segundos. Outros formatos e gravação directa continuam indisponíveis no piloto.',
};
export function pilotEnabled() { return process.env.AI_PILOT_ENABLED === 'true'; }
export function pilotAccount(user?: { email?: string; email_confirmed_at?: string | null } | null) {
 return !!user?.email_confirmed_at && user.email?.trim().toLowerCase() === PILOT_EMAIL;
}
// Conservative, non-refundable authorisations, NOT an invoice or measured spend.
// A failed/timed-out request keeps its reservation. No monthly replenishment.
export async function reservePilot(admin: NonNullable<ReturnType<typeof createAdminClient>>, actor: string, id: string, kind: PilotKind) {
 if (!pilotEnabled()) return;
 if (Date.now() > Date.parse(PILOT_EXPIRES)) throw new Error('PILOT_EXPIRED');
 const result = await admin.rpc('ai_pilot_reserve', { p_actor: actor, p_id: id, p_kind: kind });
 if (result.error || result.data !== true) {
  const code = ['PILOT_EXHAUSTED','PILOT_EXPIRED','PILOT_FORBIDDEN','PILOT_DUPLICATE'].find(c => result.error?.message.includes(c));
  throw new Error(code || 'PILOT_SETUP');
 }
}
export function pilotOptions() {
 return pilotEnabled() ? { model: PILOT_MODEL, service_tier: 'default' as const, max_output_tokens: 12000, max_tool_calls: 2 } : {};
}
// Read the entire RIFF container, not a client-supplied duration. Compressed and
// ambiguous containers are rejected before reserving budget or sending audio.
export function validatePilotWav(bytes: Buffer, ext: string) {
 if (!pilotEnabled()) return;
 const fail = () => { throw new Error('PILOT_AUDIO'); };
 if (ext !== 'wav' || bytes.length < 44 || bytes.toString('ascii',0,4) !== 'RIFF' || bytes.toString('ascii',8,12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 !== bytes.length) return fail();
 let rate = 0, align = 0, data = 0, formats = 0, dataChunks = 0, offset = 12;
 while (offset + 8 <= bytes.length) {
  const name = bytes.toString('ascii',offset,offset+4), size = bytes.readUInt32LE(offset+4), start = offset+8;
  if (start + size > bytes.length) return fail();
  if (name === 'fmt ') {
   if (++formats !== 1 || size !== 16 || bytes.readUInt16LE(start) !== 1) return fail();
   const channels = bytes.readUInt16LE(start+2), sampleRate = bytes.readUInt32LE(start+4);
   align = bytes.readUInt16LE(start+12); rate = bytes.readUInt32LE(start+8);
   if (![1,2].includes(channels) || sampleRate < 8000 || sampleRate > 48000 || bytes.readUInt16LE(start+14) !== 16 || align !== channels*2 || rate !== sampleRate*align) return fail();
  } else if (name === 'data') { data += size; dataChunks++; }
  else if (!['JUNK','LIST'].includes(name)) return fail();
  offset = start+size+(size%2);
 }
 if (offset !== bytes.length || formats !== 1 || dataChunks !== 1 || !rate || !data || data%align || data/rate > 60) fail();
}
