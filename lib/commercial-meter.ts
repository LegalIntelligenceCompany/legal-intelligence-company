import 'server-only';
import type {createAdminClient} from './supabase/admin';
import {quoteReservation, readResponseUsage, readTranscriptionUsage, responseCostNanoUsd, type ResponseUsage, type ExchangeSnapshot, type StageBudget} from './inference-cost';
import {readLivePeriod} from './live-subscription';

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export type MeterRequest = {id:string; actor_id:string; plan:StageBudget[]; exchange:ExchangeSnapshot; state:string; actual_cents:number|null; created_at:string};
export type MeterService = 'economical'|'advanced'|'document'|'assistant-research'|'analysis'|'transcription';
export const meterServices: MeterService[] = ['economical','advanced','document','assistant-research','analysis','transcription'];
export const meterMessages: Record<string,string> = {
 METER_SETUP:'A carteira comercial ainda não está configurada. Não foi iniciada uma chamada paga.',
 METER_FORBIDDEN:'Não tem acesso à carteira seleccionada.',
 METER_BALANCE:'Créditos insuficientes para reservar o custo máximo deste pedido. Não foi iniciada uma chamada paga.',
 METER_DUPLICATE:'Este pedido já tem uma reserva. Recupere o pedido existente; não foi iniciado novamente.',
 METER_SUBSCRIPTION:'É necessária uma subscrição comercial activa e confirmada.',
 METER_FROZEN:'A carteira está bloqueada para revisão de pagamentos.',
 METER_UNCONFIRMED:'O consumo ainda não pôde ser confirmado. A reserva mantém-se e não repetimos o pedido.',
 METER_QUOTE_CHANGED:'O limite de custo mudou. Actualize o saldo e confirme novamente antes de pesquisar. Não foi iniciada uma chamada paga.',
};
export function commercialMeterEnabled() {
 // Separate switch, OFF by default. The old execution/pilot flags cannot enable it.
 return process.env.AI_COMMERCIAL_ENABLED === 'true' && process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') === true;
}
function checked(error:{message?:string}|null) {
 if (error) throw Error(Object.keys(meterMessages).find(code=>error.message?.includes(code)) || 'METER_UNCONFIRMED');
}
export function meterConfiguration(service:MeterService) {
 try {
  const config=JSON.parse(process.env.AI_COMMERCIAL_TARIFFS_JSON || '');
  const plan=config[service] as StageBudget[];
  const advanced=service==='advanced';
  const exchange=config.exchange as ExchangeSnapshot;
  if (!Array.isArray(plan)||plan.length!==(service==='analysis'?3:service==='transcription'?1:2)) throw Error();
  for(const stage of plan) {
   if(!stage || typeof stage.tariff?.model!=='string' || !/^gpt-[a-zA-Z0-9.-]+$/.test(stage.tariff.model) ||
      stage.tariff.tier!=='default' || stage.maxOutput<1 || stage.maxOutput>12000 ||
      stage.maxWebSearchCalls<0 || stage.maxWebSearchCalls>2 || stage.maxInput<1 ||
      stage.tariff.inputNanoUsd<=0 || stage.tariff.outputNanoUsd<=0 ||
      (stage.maxWebSearchCalls>0&&stage.tariff.webSearchNanoUsd<=0)) throw Error();
  }
  // A tariff snapshot must explicitly attest the aggregate provider input bound.
  // Never infer a safe ceiling from a prompt's character count.
  if(config.providerInputBoundsReviewed!==true) throw Error();
  if(service==='economical'||advanced) {
   if(plan[0].maxWebSearchCalls!==2 || plan[1].maxWebSearchCalls!==(advanced?0:2))throw Error();
   if(!/^gpt-5-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(plan[0].tariff.model)||
     !(advanced?/^gpt-6-astra(?:-\d{4}-\d{2}-\d{2})?$/:/^gpt-5-mini(?:-\d{4}-\d{2}-\d{2})?$/).test(plan[1].tariff.model))throw Error();
  } else if(service==='transcription') {
   if(!/^gpt-4o(?:-mini)?-transcribe(?:-\d{4}-\d{2}-\d{2})?$/.test(plan[0].tariff.model)||!Number.isSafeInteger(plan[0].tariff.audioInputNanoUsd)||!plan[0].tariff.audioInputNanoUsd||plan[0].maxWebSearchCalls!==0)throw Error();
  } else {
   if(plan.some(s=>!/^gpt-(?:5-mini|6-astra)(?:-\d{4}-\d{2}-\d{2})?$/.test(s.tariff.model)))throw Error();
   const tools=service==='document'?[0,0]:service==='analysis'?[0,2,0]:[2,2];
   if(plan.some((s,i)=>s.maxWebSearchCalls!==tools[i]))throw Error();
  }
  const quote=quoteReservation(plan,exchange,Date.now());
  if(quote.customerBaseCents<1||quote.customerBaseCents>50000)throw Error();
  return {plan,exchange,ceiling:quote.customerBaseCents};
 } catch {throw Error('METER_SETUP');}
}
export async function commercialFundingInfo(db:Admin,actor:string) {
 const wallets=await commercialWallets(db,actor);
 return {mode:'commercial' as const,wallets,ceilings:{economical:meterConfiguration('economical').ceiling,advanced:meterConfiguration('advanced').ceiling}};
}
export async function commercialWallets(db:Admin,actor:string) {
 const result=await db.rpc('ai_meter_wallets',{p_actor:actor});checked(result.error);
 const wallets=result.data as {id:string;scope:string;balanceCents:number;reservedCents:number;availableCents:number;active:boolean;frozen:boolean}[];
 if(!Array.isArray(wallets))throw Error('METER_SETUP');
 return wallets;
}
export async function reserveCommercialResearch(db:Admin,actor:string,id:string,advanced:boolean,walletId?:unknown,maxDebitCents?:unknown) {
 return reserveCommercialService(db,actor,id,advanced?'advanced':'economical',walletId,maxDebitCents);
}
export async function reserveCommercialService(db:Admin,actor:string,id:string,service:MeterService,walletId?:unknown,maxDebitCents?:unknown) {
 if(!commercialMeterEnabled())throw Error('METER_SETUP');
 const {plan,exchange,ceiling}=meterConfiguration(service);
 if(typeof maxDebitCents!=='number'||!Number.isSafeInteger(maxDebitCents)||maxDebitCents<ceiling||maxDebitCents>50000)throw Error('METER_QUOTE_CHANGED');
 const wallets=await commercialWallets(db,actor);
 const selected=walletId==null&&wallets.length===1?wallets[0]:wallets.find(w=>w.id===walletId);
 if(!selected)throw Error('METER_FORBIDDEN');
 const stored=await db.from('ai_credit_wallets').select('live_customer,live_subscription,organization_id').eq('id',selected.id).single();
 if(stored.error||!stored.data)throw Error('METER_SETUP');
 const activeUntil=await readLivePeriod(stored.data);
 const refreshed=await db.from('ai_credit_wallets').update({active_until:activeUntil}).eq('id',selected.id)
  .eq('live_subscription',stored.data.live_subscription).eq('live_customer',stored.data.live_customer).select('id').single();
 if(refreshed.error||!refreshed.data)throw Error('METER_UNCONFIRMED');
 // SQL rechecks current membership under the wallet lock, not just this list.
 const reserved=await db.rpc('ai_meter_reserve_v2',{p_actor:actor,p_wallet:selected.id,p_id:id,p_ceiling:ceiling,p_plan:plan,p_exchange:exchange});
 checked(reserved.error);if(reserved.data!==true)throw Error('METER_UNCONFIRMED');
 return loadCommercialResearch(db,actor,id);
}
export async function loadCommercialResearch(db:Admin,actor:string,id:string):Promise<MeterRequest> {
 const result=await db.from('ai_meter_requests').select('id,actor_id,plan,exchange,state,actual_cents,created_at').eq('id',id).eq('actor_id',actor).single();
 if(result.error||!result.data)throw Error('METER_UNCONFIRMED');
 return result.data as MeterRequest;
}
export function meteredResearchBody(meter:MeterRequest,index:number,body:Record<string,unknown>) {
 const stage=meter.plan[index];if(!stage)throw Error('METER_SETUP');
 // Check stored snapshots before each submission; recovery never adopts new prices.
 try {quoteReservation([stage],meter.exchange,Date.now());}catch{throw Error('METER_SETUP');}
 if(stage.maxWebSearchCalls===0&&Array.isArray(body.tools)&&body.tools.length)throw Error('METER_SETUP');
 return {...body,model:stage.tariff.model,service_tier:stage.tariff.tier,
  max_output_tokens:stage.maxOutput,...(stage.maxWebSearchCalls>0?{max_tool_calls:stage.maxWebSearchCalls}:{}),truncation:'disabled'};
}
export async function recordCommercialResearch(db:Admin,actor:string,meter:MeterRequest,index:number,raw:unknown) {
 try { await recordUsage(db,actor,meter,index,readResponseUsage(raw)); } catch {throw Error('METER_UNCONFIRMED');}
}
export async function recordCommercialAudio(db:Admin,actor:string,meter:MeterRequest,raw:unknown,requestId:string) {
 try { await recordUsage(db,actor,meter,0,readTranscriptionUsage(raw,requestId,meter.plan[0].tariff.model)); } catch {throw Error('METER_UNCONFIRMED');}
}
export async function skipCommercialResearch(db:Admin,actor:string,meter:MeterRequest) {
 // Only the no-jurisdiction branch, before any research submission, may skip.
 if(meter.plan.length!==3)throw Error('METER_SETUP');
 const stage=meter.plan[1];
 const result=await db.rpc('ai_meter_record',{p_actor:actor,p_id:meter.id,p_stage:1,p_usage:{responseId:`skip_${meter.id}`,model:stage.tariff.model,tier:stage.tariff.tier,input:0,cachedInput:0,output:0,webSearchCalls:0,reason:'no_research_jurisdiction'}});
 checked(result.error);if(result.data!==true)throw Error('METER_UNCONFIRMED');
}
async function recordUsage(db:Admin,actor:string,meter:MeterRequest,index:number,usage:ResponseUsage) {
 try {
  const stage=meter.plan[index];
  if(!stage||usage.input>stage.maxInput||usage.output>stage.maxOutput||usage.webSearchCalls>stage.maxWebSearchCalls)throw Error();
  responseCostNanoUsd(usage,stage.tariff,Date.parse(meter.created_at));
  const result=await db.rpc('ai_meter_record',{p_actor:actor,p_id:meter.id,p_stage:index,p_usage:usage});
  checked(result.error);if(result.data!==true)throw Error();
 }catch{throw Error('METER_UNCONFIRMED');}
}
export async function settleCommercialResearch(db:Admin,actor:string,id:string) {
 const result=await db.rpc('ai_meter_settle',{p_actor:actor,p_id:id});checked(result.error);
 if(!Number.isSafeInteger(result.data)||result.data<0)throw Error('METER_UNCONFIRMED');
 return result.data as number;
}
