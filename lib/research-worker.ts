import {createAdminClient} from './supabase/admin';
import {executeResearch} from './research-execution';

export async function advanceStoredResearch(jobId:string){
 const admin=createAdminClient();if(!admin)throw Error('SETUP');
 const found=await admin.from('research_jobs').select('owner_id,state,expires_at,model').eq('id',jobId).maybeSingle();
 if(found.error)throw Error('SETUP');
 if(!found.data||Date.parse(found.data.expires_at)<=Date.now())return {terminal:true};
 if(['completed','failed'].includes(found.data.state))return {terminal:true};
 const auth=await admin.auth.admin.getUserById(found.data.owner_id);
 if(auth.error||!auth.data.user?.email_confirmed_at)throw Error('FORBIDDEN');
 const bannedUntil=(auth.data.user as typeof auth.data.user&{banned_until?:string}).banned_until;
 if(bannedUntil&&Date.parse(bannedUntil)>Date.now())throw Error('FORBIDDEN');
 const response=await executeResearch({action:'advance',id:jobId},{admin,user:auth.data.user});
 if(!response.ok)throw Error('WORKER_RETRY');
 const body=await response.json();
 return {terminal:['completed','failed'].includes(body.job?.state),state:body.job?.state,previousState:found.data.state,needsSettlement:body.job?.state==='review'&&found.data.model.startsWith('review-')};
}
