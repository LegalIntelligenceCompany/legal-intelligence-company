import 'server-only';
import type {createAdminClient} from './supabase/admin';
type DB=NonNullable<ReturnType<typeof createAdminClient>>;
export function recoveryRequested(request:Request){return request.headers.get('x-recovery-consent')==='true';}
export async function beginRecovery(db:DB,request:Request,id:string,actor:string,kind:'assistant'|'transcription',organization?:string,documents:string[]=[]){
 if(!recoveryRequested(request))return false;
 const {error}=await db.from('service_results').insert({id,actor_id:actor,kind,organization_id:organization||null,document_ids:documents});
 if(error)throw Error('RECOVERY_SETUP');
 return true;
}
export async function saveRecovery(db:DB,id:string,actor:string,result:unknown){
 const {data,error}=await db.from('service_results').update({state:'completed',result}).eq('id',id).eq('actor_id',actor).gt('expires_at',new Date().toISOString()).select('id');
 if(error||data?.length!==1)throw Error('RECOVERY_SAVE');
}
export async function uncertainRecovery(db:DB,id:string,actor:string){
 // Never overwrite a completed result when later accounting or delivery fails.
 await db.from('service_results').update({state:'uncertain'}).eq('id',id).eq('actor_id',actor).eq('state','processing');
}
