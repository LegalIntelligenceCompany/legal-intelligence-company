import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { billingConfig,isBillingTester,safePortalURL,stripeTestRequest } from '@/lib/billing';
import { billingAdmin,withBillingLock } from '@/lib/billing-store';
import { checkout,dbCheck,fulfillSession,prepaidCodes,refreshOwner,walletForOwner } from '@/lib/prepaid-test';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function owner(){
 const c=await createClient(true);const u=(await c?.auth.getUser())?.data.user;
 if(!u?.email_confirmed_at||!isBillingTester(u.email,billingConfig().tester))throw Error('FORBIDDEN');return u;
}
const messages:Record<string,string>={
 SETUP_REQUIRED:'Falta preparar a carteira de teste. Execute a actualização 012 em Preparar carteira.',
 FORBIDDEN:'Operação reservada à conta de configuração e às suas carteiras.',
 SUBSCRIPTION_REQUIRED:'Confirme a subscrição de teste. Se já existe, não crie outra.',
 INSUFFICIENT_CREDITS:'Saldo disponível insuficiente. Nenhum pedido de IA foi iniciado.',
 FROZEN:'Carteira bloqueada para revisão de um reembolso ou disputa.',
 SEAT_LIMIT:'O plano Empresas inclui no máximo três utilizadores, contando com o titular.',
 CONFLICT:'Operação não confirmada. Consulte o estado antes de repetir.',
 BUSY:'Existe uma operação em curso. Aguarde; o estado será actualizado automaticamente.',
 DUPLICATE:'Esta tentativa já foi registada e não foi repetida.',
};
function failure(e:unknown){const code=e instanceof Error&&prepaidCodes.some(c=>c===e.message)?e.message:'PROVIDER';return json({code,error:messages[code]||'Não foi possível concluir. Nenhuma chamada à IA foi feita.'},code==='FORBIDDEN'?403:code==='INVALID'?400:code==='INSUFFICIENT_CREDITS'?402:503);}
export async function GET(request:Request){try{
 const u=await owner();const session=new URL(request.url).searchParams.get('session_id');
 if(session)await fulfillSession(session,u.id);
 return json({wallets:await refreshOwner(u.id),testOnly:true,aiEnabled:false});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw Error('FORBIDDEN');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('INVALID');
 const u=await owner();
 const reader=request.body?.getReader();if(!reader)throw Error('INVALID');let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw Error('INVALID');}chunks.push(value);}}finally{reader.releaseLock();}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('INVALID');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('INVALID');
 const db=billingAdmin();
 if(body.action==='open'){
  if(!['individual','business'].includes(body.plan)||(body.organizationId!=null&&!uuid(body.organizationId)))throw Error('INVALID');
  const r=await db.rpc('prepaid_test_open',{p_actor:u.id,p_plan:body.plan,p_org:body.organizationId||null});dbCheck(r.error);return json({walletId:r.data,testOnly:true});
 }
 if(!uuid(body.walletId))throw Error('INVALID');
 await walletForOwner(db,u.id,body.walletId);
 if(body.action==='portal'){
  const url=await withBillingLock(u.id,async(_admin,account)=>{
   if(!account.customer_id)throw Error('SUBSCRIPTION_REQUIRED');
   const p=await stripeTestRequest('billing_portal/sessions',new URLSearchParams({customer:account.customer_id,return_url:`${new URL(request.url).origin}/setup/credits`,locale:'pt'}));
   return safePortalURL(p.url);
  });
  return json({url,testOnly:true});
 }
 if(body.action==='checkout'){
  if(!uuid(body.requestId)||!['access','credits'].includes(body.kind)|| (body.kind==='credits'&&(!Number.isSafeInteger(body.amountCents)||body.amountCents<100||body.amountCents>50000)))throw Error('INVALID');
  return json({...await checkout(u.id,body.walletId,body.requestId,body.kind,body.amountCents,new URL(request.url).origin),testOnly:true});
 }
 if(body.action==='seat'){
  if(!uuid(body.memberId)||typeof body.add!=='boolean')throw Error('INVALID');
  const r=await db.rpc('prepaid_test_member',{p_actor:u.id,p_wallet:body.walletId,p_member:body.memberId,p_add:body.add});dbCheck(r.error);return json({saved:true,testOnly:true});
 }
 if(body.action==='simulate'){
  if(!uuid(body.requestId))throw Error('INVALID');
  await refreshOwner(u.id);
  // Fixed server-side fixture: reserve 0.60 EUR, consume 0.30 EUR (0.10 ×3).
  // Client cannot choose its debit, cost, ceiling or settlement outcome.
  const reserve=await db.rpc('prepaid_test_reserve',{p_actor:u.id,p_wallet:body.walletId,p_id:body.requestId,p_ceiling:60});dbCheck(reserve.error);
  const settled=await db.rpc('prepaid_test_settle',{p_id:body.requestId,p_cost_micros:100000});dbCheck(settled.error);
  return json({debitedCents:settled.data,testOnly:true,aiCalled:false});
 }
 throw Error('INVALID');
}catch(e){return failure(e);}}
