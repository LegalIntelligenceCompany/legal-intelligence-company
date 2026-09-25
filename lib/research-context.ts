import type {AssistantInput, AssistantResult} from './assistant';

/** Bounded, server-owned context. Never trust a client-supplied past answer. */
export function followUpHistory(input: AssistantInput, result: AssistantResult): AssistantInput['history'] {
 const pairs = [...input.history, {role:'user' as const,content:input.question}, {role:'assistant' as const,content:result.text}].slice(-4);
 return pairs.map(m=>({...m,content:m.content.slice(0,m.role==='user'?4000:9000)}));
}
export const researchId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
