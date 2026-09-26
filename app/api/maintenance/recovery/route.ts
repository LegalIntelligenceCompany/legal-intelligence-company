import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){
 const started=Date.now();
 const headers={'Cache-Control':'no-store'};
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 // Only aggregate counts and fixed labels: never log credentials, IDs or content.
 const report=(status:string,details:Record<string,unknown>={})=>console.info(JSON.stringify({event:'lic.recovery.cleanup',status,durationMs:Date.now()-started,...details}));
 try{const db=createAdminClient();if(!db){report('unavailable');return NextResponse.json({error:'Unavailable'},{status:503,headers});}
 const cutoff=new Date().toISOString();
 const [results,research,audit]=await Promise.all([
  db.from('service_results').delete({count:'exact'}).lt('expires_at',cutoff),
  db.from('research_jobs').delete({count:'exact'}).lt('expires_at',cutoff),
  db.from('research_audit').delete({count:'exact'}).lt('occurred_at',new Date(started-90*86400000).toISOString()),
 ]);
 const auditUnavailable=!!audit.error&&['42P01','PGRST205'].includes(audit.error.code);
 const failed=!!(results.error||research.error||(audit.error&&!auditUnavailable));
 const counts={results:results.error?null:results.count??null,research:research.error?null:research.count??null,audit:audit.error?null:audit.count??null};
 report(failed?'failed':auditUnavailable?'partial':'completed',{counts,auditUnavailable});
 return NextResponse.json(failed?{error:'Cleanup failed'}:{cleaned:true,counts,auditUnavailable},{status:failed?503:200,headers});
 }catch{report('failed');return NextResponse.json({error:'Cleanup failed'},{status:503,headers});}
}
