import 'server-only';
import {checkExternalModel,externalReview} from './external-review';
import {pilotAccount,pilotEnabled,PILOT_EXPIRES} from './ai-pilot';
import type {createAdminClient} from './supabase/admin';

const model={id:'review-sonnet',label:'Claude Sonnet',provider:'anthropic' as const,model:'claude-sonnet-5',validated:false};
// Fixed synthetic material, no customer input, web tools or automatic retries.
const instructions='Responde em português de Portugal. Este é um teste com documentos inteiramente fictícios, não legislação. Usa apenas o material fornecido, sem inventar fontes. Assinala expressamente a contradição entre os documentos e que não é possível determinar qual prevalece.';
const prompt='Documento fictício A [A]: O prazo de resposta é de dez dias. Documento fictício B [B]: O prazo de resposta é de vinte dias. Resume o problema em até 100 palavras, cita ambos os identificadores e não resolvas a contradição sem fundamento.';
const schema={type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false};
export async function runClaudePilot(admin:NonNullable<ReturnType<typeof createAdminClient>>,user:{id:string;email?:string;email_confirmed_at?:string|null},consent:boolean){
 if(!pilotAccount(user)||!consent)throw Error('PILOT_FORBIDDEN');
 if(!pilotEnabled()||process.env.AI_EXECUTION_ENABLED!=='true'||!process.env.ANTHROPIC_API_KEY)throw Error('PILOT_SETUP');
 if(Date.now()>Date.parse(PILOT_EXPIRES))throw Error('PILOT_EXPIRED');
 const existing=await admin.from('ai_claude_pilot').select('status').eq('singleton',true).maybeSingle();
 if(existing.error)throw Error('PILOT_SETUP');
 if(existing.data)throw Error('PILOT_DUPLICATE');
 await checkExternalModel(model);
 const reserved=await admin.rpc('ai_claude_pilot_reserve',{p_actor:user.id});
 if(reserved.error||reserved.data!==true){
  const code=['PILOT_EXHAUSTED','PILOT_DUPLICATE','PILOT_EXPIRED','PILOT_FORBIDDEN'].find(c=>reserved.error?.message.includes(c));
  throw Error(code||'PILOT_SETUP');
 }
 try{
  // Published 2026-09-23: $2/$10 per million input/output tokens.
  // At these caps, <= $0.01 base inference, far below the EUR 1 reserve.
  // Pricing source: https://platform.claude.com/docs/en/about-claude/pricing
  const raw=await externalReview(model,instructions,prompt,schema,2000,600);
  if(raw.status!=='completed')throw Error('INCOMPLETE');
  const parsed=JSON.parse(raw.output[0].content[0].text);
  if(typeof parsed.answer!=='string'||!parsed.answer.trim()||parsed.answer.length>4000)throw Error('FORMAT');
  const saved=await admin.from('ai_claude_pilot').update({status:'completed',result:{answer:parsed.answer,model:raw.model,usage:raw.usage,providerResponseId:raw.id}}).eq('singleton',true).eq('owner_id',user.id).select('status').single();
  if(saved.error||saved.data?.status!=='completed')throw Error('SAVE');
  return 'Resposta recebida e guardada. O teste técnico não aprova qualidade jurídica nem activa o modelo. A reserva de 1 € mantém-se no orçamento; não é o custo facturado.';
 }catch{
  await admin.from('ai_claude_pilot').update({status:'uncertain'}).eq('singleton',true).eq('owner_id',user.id).eq('status','reserved');
  throw Error('CLAUDE_UNCERTAIN');
 }
}
