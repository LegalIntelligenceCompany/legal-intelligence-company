import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32||request.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{const db=createAdminClient();if(!db)return NextResponse.json({error:'Unavailable'},{status:503});
 const result=await db.from('service_results').delete().lt('expires_at',new Date().toISOString());
 return NextResponse.json(result.error?{error:'Cleanup failed'}:{cleaned:true},{status:result.error?503:200,headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Cleanup failed'},{status:503});}
}
