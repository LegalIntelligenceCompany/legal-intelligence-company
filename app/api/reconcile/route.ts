import {NextResponse} from 'next/server';
import {isSiteOwner} from '@/lib/site-owner';
import {createAdminClient} from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(request.headers.get('origin')!==new URL(request.url).origin||!await isSiteOwner())return json({error:'Não autorizado.'},403);
 try{
  const id=new URL(request.url).searchParams.get('id');if(!id||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(id))return json({error:'Referência inválida.'},400);
  const db=createAdminClient();if(!db)return json({error:'Configuração indisponível.'},503);
  const row=await db.from('ai_meter_requests').select('actor_id').eq('id',id).single();if(row.error||!row.data)return json({error:'Pedido não encontrado.'},404);
  // SQL checks all stages, receipts, the original ceiling and exchange snapshot,
  // and locks the wallet. Repeated calls return the same debit without recharging.
  const settled=await db.rpc('ai_meter_settle',{p_actor:row.data.actor_id,p_id:id});
  if(settled.error)return json({error:'Acerto não confirmado. Faltam recibos válidos ou é necessária investigação. A reserva não foi libertada.'},409);
  return json({chargedCents:settled.data});
 }catch{return json({error:'Não foi possível confirmar o acerto. Consulte o estado antes de repetir.'},503);}
}
