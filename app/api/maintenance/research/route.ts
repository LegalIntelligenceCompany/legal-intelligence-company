import {createAdminClient} from '@/lib/supabase/admin';
import {advanceStoredResearch} from '@/lib/research-worker';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized'},{status:401});
 const db=createAdminClient();if(!db)return Response.json({error:'Unavailable'},{status:503});
 const jobs=await db.from('research_jobs').select('id').in('state',['draft','review']).gt('expires_at',new Date().toISOString()).order('updated_at').limit(2);
 if(jobs.error)return Response.json({error:'Unavailable'},{status:503});
 const results=await Promise.allSettled((jobs.data??[]).map(row=>advanceStoredResearch(row.id)));
 const failed=results.filter(r=>r.status==='rejected').length;
 return Response.json({checked:results.length,failed},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
}
