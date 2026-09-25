import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{
 const client=await createClient(true);const auth=await client?.auth.getUser();const actor=auth?.data.user;
 if(!client||auth?.error||!actor?.email_confirmed_at)return json({error:'Entre na sua conta para recuperar resultados.'},401);
 const db=createAdminClient();if(!db)return json({error:'Recuperação indisponível.'},503);
 const now=new Date().toISOString();
 const purge=await db.from('service_results').delete().lt('expires_at',now).eq('actor_id',actor.id);if(purge.error)return json({error:'Falta instalar a recuperação de resultados (018).'},503);
 const rows=await db.from('service_results').select('id,kind,organization_id,document_ids,state,result,created_at,expires_at').eq('actor_id',actor.id).gt('expires_at',now).order('created_at',{ascending:false}).limit(50);
 if(rows.error)return json({error:'Não foi possível consultar os resultados.'},503);
 const results=[];
 for(const row of rows.data||[]){
  if(row.organization_id){const membership=await client.from('organization_members').select('user_id').eq('organization_id',row.organization_id).eq('user_id',actor.id).maybeSingle();if(membership.error||!membership.data)continue;}
  let allowed=true;for(const id of row.document_ids||[]){const doc=await client.from('contracts').select('id').eq('id',id).eq('organization_id',row.organization_id).maybeSingle();if(doc.error||!doc.data){allowed=false;break;}}
  if(!allowed)continue;
  results.push({id:row.id,kind:row.kind,state:row.state==='processing'&&Date.now()-Date.parse(row.created_at)>300000?'uncertain':row.state,result:row.result,createdAt:row.created_at,expiresAt:row.expires_at});
 }
 return json({results});
}catch{return json({error:'Não foi possível recuperar. Não reenvie a geração para tentar recuperar um resultado.'},503);}}
