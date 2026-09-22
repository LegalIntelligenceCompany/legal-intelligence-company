import {NextResponse} from 'next/server';
import OpenAI from 'openai';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {paidAIAccessError} from '@/lib/billing-access';
import {reservePilot,PILOT_MODEL,pilotMessages} from '@/lib/ai-pilot';
import {validateAssistantInput,parseAssistantResponse} from '@/lib/assistant';
import {researchErrors,publicJob,researchBody,reviewedResult,validResponseId,type ResearchJob} from '@/lib/research-jobs';
import {allowedResearchModel,advancedReviewBody,advancedReviewResult} from '@/lib/research-models';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
const fail=(code:string,status=400)=>json({error:researchErrors[code]||pilotMessages[code]||researchErrors.PROVIDER,code},status);
async function context(){const client=await createClient(true);const auth=await client?.auth.getUser();const user=auth?.data.user;const admin=createAdminClient();return {user,admin};}
// Read-only recovery never submits a generation or consumes a new reservation.
export async function GET(){
 const {user,admin}=await context();if(!user||!admin)return fail('FORBIDDEN',401);
 const found=await admin.from('research_jobs').select('*').eq('owner_id',user.id).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(found.error)return fail('SETUP',503);
 return json({job:found.data?publicJob(found.data):null});
}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN',403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return fail('INVALID_REQUEST');
 let body;try{const reader=request.body?.getReader();if(!reader)throw Error();let text='';let size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>60000){await reader.cancel();throw Error();}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();body=JSON.parse(text);}catch{return fail('INVALID_REQUEST');}
 if(!body||typeof body!=='object'||Array.isArray(body))return fail('INVALID_REQUEST');
 const {user,admin}=await context();if(!user||!admin)return fail('FORBIDDEN',401);
 if(process.env.AI_EXECUTION_ENABLED!=='true')return fail('PAUSED',503);
 const denied=paidAIAccessError(user);if(denied)return fail(denied,403);
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
   if(!allowedResearchModel(model))return fail('MODEL',403);
   const existing=await admin.from('research_jobs').select('*').eq('id',input.requestId).eq('owner_id',user.id).maybeSingle();
   if(existing.error)return fail('SETUP',503);if(existing.data)return json({job:publicJob(existing.data)});
   // Availability check has no generation and happens before any reservation.
   if(model!==PILOT_MODEL){try{await openai.models.retrieve(model);}catch{return fail('MODEL_UNAVAILABLE',503);}}
   await admin.from('research_jobs').update({state:'failed',error:'EXPIRED',updated_at:now()}).eq('owner_id',user.id).in('state',['starting','draft','review_starting','review']).lt('updated_at',new Date(Date.now()-8*60000).toISOString());
   const inserted=await admin.from('research_jobs').insert({id:input.requestId,owner_id:user.id,input,model}).select('*').single();
   if(inserted.error)return fail(inserted.error.code==='23505'?'BUSY':'SETUP',409);
   job=inserted.data;
   const claim=await admin.rpc('assistant_begin',{p_id:input.requestId,p_actor:user.id});if(claim.error)throw Error('BUSY');
   await reservePilot(admin,user.id,input.requestId,model===PILOT_MODEL?'research':'research-advanced');
   submitting=true;
   const response=await openai.post<unknown,Record<string,unknown>>('/responses',{body:researchBody(input,PILOT_MODEL)});
   if(!validResponseId(response.id))throw Error('UNKNOWN');
   await update({state:'draft',response_id:response.id});submitting=false;
   return json({job:publicJob(job!)});
  }
  if(body.action!=='advance'||typeof body.id!=='string'||!/^[-0-9a-f]{36}$/i.test(body.id))return fail('INVALID_REQUEST');
  const found=await admin.from('research_jobs').select('*').eq('id',body.id).eq('owner_id',user.id).maybeSingle();
  if(found.error)return fail('SETUP',503);if(!found.data)return fail('FORBIDDEN',404);job=found.data;
  if(['completed','failed'].includes(job!.state))return json({job:publicJob(job!)});
  if(Date.now()-Date.parse(job!.updated_at)>8*60000){await update({state:'failed',error:'EXPIRED'});return json({job:publicJob(job!)});}
  if(['starting','review_starting'].includes(job!.state))return json({job:publicJob(job!)});
  if(!validResponseId(job!.response_id))throw Error('UNKNOWN');
  const raw=await openai.get<unknown,Record<string,unknown>>('/responses/'+job!.response_id);
  if(['queued','in_progress'].includes(String(raw.status)))return json({job:publicJob(job!)});
  if(raw.status!=='completed')throw Error('INCOMPLETE');
  if(job!.state==='draft'){
   const draft=parseAssistantResponse(raw,true);
   // Compare-and-swap before the only review submission. Concurrent polls lose
   // the claim; uncertain submissions are never automatically retried.
   const reviewBody=job!.model===PILOT_MODEL?researchBody(job!.input,job!.model,draft):advancedReviewBody(job!.input,draft);
   const lock=await admin.from('research_jobs').update({state:'review_starting',result:draft,updated_at:now()}).eq('id',job!.id).eq('owner_id',user.id).eq('state','draft').select('*').maybeSingle();
   if(lock.error)throw Error('UNKNOWN');if(!lock.data)return json({job:publicJob({...job!,state:'review_starting'})});job=lock.data;
   submitting=true;
   const review=await openai.post<unknown,Record<string,unknown>>('/responses',{body:reviewBody});
   if(!validResponseId(review.id))throw Error('UNKNOWN');
   await update({state:'review',response_id:review.id});submitting=false;
  }else{
   if(job!.model!==PILOT_MODEL&&!job!.result)throw Error('INCOMPLETE');
   await update({state:'completed',result:job!.model===PILOT_MODEL?reviewedResult(raw,job!.model):advancedReviewResult(raw,job!.result!)});
   await admin.rpc('assistant_finish',{p_id:job!.id,p_actor:user.id,p_success:true});
  }
  return json({job:publicJob(job!)});
 }catch(error){
  const e=error as {status?:number};const code=error instanceof OpenAI.APIConnectionTimeoutError?'TIMEOUT':error instanceof Error&&(researchErrors[error.message]||pilotMessages[error.message])?error.message:'PROVIDER';
  console.warn('[research]',{code,state:job?.state,requestId:job?.id,status:e?.status});
  // Poll transport failures are recoverable: keep provider ID and do not restart.
  if(job&&(submitting||body.action==='start'||['INCOMPLETE','NO_SOURCES','EXPIRED'].includes(code))){try{await update({state:'failed',error:submitting?'UNKNOWN':code});await admin.rpc('assistant_finish',{p_id:job!.id,p_actor:user.id,p_success:false});}catch{/* The stored starting state blocks resubmission. */}}
  return fail(code,503);
 }
}
