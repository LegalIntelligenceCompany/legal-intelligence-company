import {Webhook} from 'standardwebhooks';
import {createAdminClient} from '@/lib/supabase/admin';
import {advanceStoredResearch} from '@/lib/research-worker';
import {validResponseId} from '@/lib/research-jobs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const reply=(status:number)=>Response.json({received:status===200},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 const secret=process.env.OPENAI_WEBHOOK_SECRET;
 if(!secret)return reply(503);
 let event:{type?:string;data?:{id?:string}};
 const eventId=request.headers.get('webhook-id');
 if(!eventId||eventId.length>200)return reply(400);
 try{
  const reader=request.body?.getReader();if(!reader)return reply(400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>20000){await reader.cancel();return reply(413);}chunks.push(next.value);}
  const raw=Buffer.concat(chunks).toString('utf8');
  event=new Webhook(secret).verify(raw,Object.fromEntries(request.headers)) as typeof event;
 }catch{return reply(400);}
 if(!event||typeof event!=='object')return reply(400);
 if(!['response.completed','response.failed','response.incomplete','response.cancelled'].includes(event.type??''))return reply(200);
 if(!validResponseId(event.data?.id))return reply(400);
 const admin=createAdminClient();if(!admin)return reply(503);
 try{
  let receipt=await admin.from('research_delivery_receipts').select('*').eq('event_id',eventId).maybeSingle();
  if(receipt.error)return reply(503);
  if(receipt.data?.response_id&&receipt.data.response_id!==event.data!.id)return reply(400);
  if(receipt.data?.completed_at)return reply(200);
  if(!receipt.data){
   const job=await admin.from('research_jobs').select('id').eq('response_id',event.data!.id).maybeSingle();
   // A callback can arrive before the initiating request stores its response ID.
   // Request redelivery instead of acknowledging and losing that completion.
   if(job.error||!job.data)return reply(503);
   const inserted=await admin.from('research_delivery_receipts').upsert({event_id:eventId,response_id:event.data!.id,job_id:job.data.id},{onConflict:'event_id',ignoreDuplicates:true});
   if(inserted.error)return reply(503);
   receipt=await admin.from('research_delivery_receipts').select('*').eq('event_id',eventId).single();
  }
  if(receipt.error||!receipt.data)return reply(503);
  const progress=await advanceStoredResearch(receipt.data.job_id);
  if(!progress.terminal&&progress.state===progress.previousState)return reply(503);
  // External reviews are persisted synchronously; settle from their saved result.
  if(progress.needsSettlement){const settled=await advanceStoredResearch(receipt.data.job_id);if(!settled.terminal)return reply(503);}
  if(progress.state==='starting'||progress.state==='review_starting')return reply(503);
  const done=await admin.from('research_delivery_receipts').update({completed_at:new Date().toISOString()}).eq('event_id',eventId);
  return reply(done.error?503:200);
 }catch{return reply(503);}
}
