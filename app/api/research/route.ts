import {NextResponse} from 'next/server';
import OpenAI from 'openai';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {paidAIAccessError} from '@/lib/billing-access';
import {reservePilot,PILOT_MODEL,pilotMessages} from '@/lib/ai-pilot';
import {validateAssistantInput,parseAssistantResponse} from '@/lib/assistant';
import {researchErrors,publicJob,researchBody,reviewedResult,validResponseId,type ResearchJob} from '@/lib/research-jobs';
import {allowedResearchModel,advancedReviewBody,advancedReviewResult} from '@/lib/research-models';
import {commercialMeterEnabled,commercialFundingInfo,meterMessages,reserveCommercialResearch,loadCommercialResearch,meteredResearchBody,recordCommercialResearch,settleCommercialResearch} from '@/lib/commercial-meter';
import {reserveCommercialService,meterConfiguration} from '@/lib/commercial-meter';
import {reviewerCatalogue,configuredReviewer} from '@/lib/reviewer-catalogue';
import {externalReview,checkExternalModel} from '@/lib/external-review';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
const fail=(code:string,status=400)=>json({error:meterMessages[code]||researchErrors[code]||pilotMessages[code]||researchErrors.PROVIDER,code},status);
async function context(){const client=await createClient(true);const auth=await client?.auth.getUser();const user=auth?.data.user;const admin=createAdminClient();return {user,admin};}
// Read-only recovery never submits a generation or consumes a new reservation.
export async function GET(){
 const {user,admin}=await context();if(!user||!admin)return fail('FORBIDDEN',401);
 const found=await admin.from('research_jobs').select('*').eq('owner_id',user.id).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(found.error)return fail('SETUP',503);
 let funding:unknown={mode:'pilot'};
 if(paidAIAccessError(user)==='BILLING_TEST_ONLY'){
  if(!commercialMeterEnabled())funding={mode:'disabled'};
  else try{funding=await commercialFundingInfo(admin,user.id);}catch{funding={mode:'disabled',error:meterMessages.METER_SETUP};}
 }
 const models: {id:string;label:string;available:boolean;reason?:string;ceiling?:number}[]=[];
 try{for(const row of reviewerCatalogue()){
  let ceiling:number|undefined;try{ceiling=meterConfiguration(row.id as `review-${string}`).ceiling;}catch{/* No key or reviewed tariff. */}
  const available=commercialMeterEnabled()&&deniedCommercial(user)&&ceiling!==undefined;
  models.push({id:row.id,label:row.label,available,ceiling,reason:available?undefined:'Requer acesso comercial, chave e tarifas validadas.'});
 }}catch{/* Invalid catalogue fails closed. */}
 return json({job:found.data?publicJob(found.data):null,funding,models});
}
function deniedCommercial(user:Parameters<typeof paidAIAccessError>[0]){return paidAIAccessError(user)==='BILLING_TEST_ONLY';}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN',403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return fail('INVALID_REQUEST');
 let body;try{const reader=request.body?.getReader();if(!reader)throw Error();let text='';let size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>60000){await reader.cancel();throw Error();}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();body=JSON.parse(text);}catch{return fail('INVALID_REQUEST');}
 if(!body||typeof body!=='object'||Array.isArray(body))return fail('INVALID_REQUEST');
 const {user,admin}=await context();if(!user||!admin)return fail('FORBIDDEN',401);
 if(process.env.AI_EXECUTION_ENABLED!=='true')return fail('PAUSED',503);
 const denied=paidAIAccessError(user);
 const commercial=denied==='BILLING_TEST_ONLY'&&commercialMeterEnabled()&&!!user.email_confirmed_at;
 if(denied&&!commercial)return fail(denied,403);
 if(!process.env.OPENAI_API_KEY)return fail('PROVIDER',503);
 const openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:'https://api.openai.com/v1',timeout:20000,maxRetries:0});
 let job:ResearchJob|null=null;let submitting=false;
 const now=()=>new Date().toISOString();
 const update=async(values:Record<string,unknown>)=>{
  const r=await admin.from('research_jobs').update({...values,updated_at:now()}).eq('id',job!.id).eq('owner_id',user.id).select('*').single();if(r.error)throw Error('UNKNOWN');job=r.data;return r.data as ResearchJob;
 };
 try{
  // Expiry clears abandoned locks. Physical cleanup occurs on the next access.
  await admin.from('research_jobs').delete().eq('owner_id',user.id).lt('expires_at',now());
  if(body.action==='start'){
   const input=validateAssistantInput(body.input);
   if(input.mode!=='research'||input.organizationId||input.material||body.backgroundConsent!==true)return fail('INVALID_REQUEST');
   const model=body.model??PILOT_MODEL;
   const external=typeof model==='string'&&model.startsWith('review-');
   if(external){if(!commercial)return fail('MODEL_UNAVAILABLE',403);configuredReviewer(model);meterConfiguration(model as `review-${string}`);}
   else if(!allowedResearchModel(model))return fail('MODEL',403);
   const existing=await admin.from('research_jobs').select('*').eq('id',input.requestId).eq('owner_id',user.id).maybeSingle();
   if(existing.error)return fail('SETUP',503);if(existing.data)return json({job:publicJob(existing.data)});
   if(external)await checkExternalModel(configuredReviewer(model));
   // Availability check has no generation and happens before any reservation.
   if(model!==PILOT_MODEL&&!external){try{await openai.models.retrieve(model);}catch{return fail('MODEL_UNAVAILABLE',503);}}
   await admin.from('research_jobs').update({state:'failed',error:'EXPIRED',updated_at:now()}).eq('owner_id',user.id).in('state',['starting','draft','review_starting','review']).lt('updated_at',new Date(Date.now()-8*60000).toISOString());
   const inserted=await admin.from('research_jobs').insert({id:input.requestId,owner_id:user.id,input,model,...(commercial?{funding_mode:'commercial'}:{})}).select('*').single();
   if(inserted.error)return fail(inserted.error.code==='23505'?'BUSY':'SETUP',409);
   job=inserted.data;
   const claim=await admin.rpc('assistant_begin',{p_id:input.requestId,p_actor:user.id});if(claim.error)throw Error('BUSY');
   const meter=commercial?(external?await reserveCommercialService(admin,user.id,input.requestId,model as `review-${string}`,body.walletId,body.maxDebitCents):await reserveCommercialResearch(admin,user.id,input.requestId,model!==PILOT_MODEL,body.walletId,body.maxDebitCents)):null;
   if(!commercial)await reservePilot(admin,user.id,input.requestId,model===PILOT_MODEL?'research':'research-advanced');
   submitting=true;
   const draftBody=researchBody(input,PILOT_MODEL);
   const response=await openai.post<unknown,Record<string,unknown>>('/responses',{body:meter?meteredResearchBody(meter,0,draftBody):draftBody});
   if(!validResponseId(response.id))throw Error('UNKNOWN');
   await update({state:'draft',response_id:response.id});submitting=false;
   return json({job:publicJob(job!)});
  }
  if(body.action!=='advance'||typeof body.id!=='string'||!/^[-0-9a-f]{36}$/i.test(body.id))return fail('INVALID_REQUEST');
  const found=await admin.from('research_jobs').select('*').eq('id',body.id).eq('owner_id',user.id).maybeSingle();
  if(found.error)return fail('SETUP',503);if(!found.data)return fail('FORBIDDEN',404);job=found.data;
  if(job!.funding_mode==='commercial'&&!commercialMeterEnabled())return fail('PAUSED',503);
  if(job!.funding_mode!=='commercial'&&commercial)return fail('FORBIDDEN',403);
  if(['completed','failed'].includes(job!.state))return json({job:publicJob(job!)});
  if(Date.now()-Date.parse(job!.updated_at)>8*60000){await update({state:'failed',error:'EXPIRED'});return json({job:publicJob(job!)});}
  if(['starting','review_starting'].includes(job!.state))return json({job:publicJob(job!)});
  const external=job!.model.startsWith('review-');
  const saved=(job!.result as {externalReview?:Record<string,unknown>}|undefined)?.externalReview;
  if(!(external&&job!.state==='review')&&!validResponseId(job!.response_id))throw Error('UNKNOWN');
  const raw=external&&job!.state==='review'?saved:await openai.get<unknown,Record<string,unknown>>('/responses/'+job!.response_id);
  if(!raw)throw Error('UNKNOWN');
  if(['queued','in_progress'].includes(String(raw.status)))return json({job:publicJob(job!)});
  const meter=job!.funding_mode==='commercial'?await loadCommercialResearch(admin,user.id,job!.id):null;
  if(meter)await recordCommercialResearch(admin,user.id,meter,job!.state==='draft'?0:1,raw);
  if(raw.status!=='completed')throw Error('INCOMPLETE');
  if(job!.state==='draft'){
   const draft=parseAssistantResponse(raw,true);
   // Compare-and-swap before the only review submission. Concurrent polls lose
   // the claim; uncertain submissions are never automatically retried.
   const reviewBody=job!.model===PILOT_MODEL?researchBody(job!.input,job!.model,draft):advancedReviewBody(job!.input,draft);
   const lock=await admin.from('research_jobs').update({state:'review_starting',result:draft,updated_at:now()}).eq('id',job!.id).eq('owner_id',user.id).eq('state','draft').select('*').maybeSingle();
   if(lock.error)throw Error('UNKNOWN');if(!lock.data)return json({job:publicJob({...job!,state:'review_starting'})});job=lock.data;
   submitting=true;
   if(external){
    if(!meter)throw Error('METER_SETUP');
    const reviewer=configuredReviewer(job!.model),stage=meter.plan[1];
    if(stage.tariff.model!==reviewer.model||stage.maxWebSearchCalls!==0)throw Error('METER_SETUP');
    // Revalidate the frozen tariff; never adopt a new model during recovery.
    meteredResearchBody(meter,1,reviewBody);
    const body=advancedReviewBody(job!.input,draft);
    const response=await externalReview(reviewer,body.instructions,body.input.map(m=>m.content).join('\n'),body.text.format.schema,stage.maxInput,stage.maxOutput);
    // Persist the response before settlement. Recovery reads it, never resubmits.
    await update({state:'review',response_id:null,result:{...draft,externalReview:response}});submitting=false;
    return json({job:publicJob(job!)});
   }
   const review=await openai.post<unknown,Record<string,unknown>>('/responses',{body:meter?meteredResearchBody(meter,1,reviewBody):reviewBody});
   if(!validResponseId(review.id))throw Error('UNKNOWN');
   await update({state:'review',response_id:review.id});submitting=false;
  }else{
   if(job!.model!==PILOT_MODEL&&!job!.result)throw Error('INCOMPLETE');
   const result=job!.model===PILOT_MODEL?reviewedResult(raw,job!.model):advancedReviewResult(raw,job!.result!,external?meter?.plan[1].tariff.model:undefined);
   const chargedCents=meter?await settleCommercialResearch(admin,user.id,job!.id):undefined;
   await update({state:'completed',result:{...result,...(chargedCents!==undefined?{chargedCents}:{})}});
   await admin.rpc('assistant_finish',{p_id:job!.id,p_actor:user.id,p_success:true});
  }
  return json({job:publicJob(job!)});
 }catch(error){
  const e=error as {status?:number};const code=error instanceof OpenAI.APIConnectionTimeoutError?'TIMEOUT':error instanceof Error&&(meterMessages[error.message]||researchErrors[error.message]||pilotMessages[error.message])?error.message:'PROVIDER';
  console.warn('[research]',{code,state:job?.state,requestId:job?.id,status:e?.status});
  // Poll transport failures are recoverable: keep provider ID and do not restart.
  if(job&&(submitting||body.action==='start'||['INCOMPLETE','NO_SOURCES','EXPIRED'].includes(code))){try{await update({state:'failed',error:submitting?'UNKNOWN':code});await admin.rpc('assistant_finish',{p_id:job!.id,p_actor:user.id,p_success:false});}catch{/* The stored starting state blocks resubmission. */}}
  return fail(code,503);
 }
}
