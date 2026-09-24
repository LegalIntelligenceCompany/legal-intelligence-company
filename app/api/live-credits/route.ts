import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {liveCreditConfig,liveCreditOrigin,liveDb,ownedLiveWallet,liveCheckout,fulfillLiveCheckout,livePortal} from '@/lib/live-credits';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const messages:Record<string,string>={LIVE_DISABLED:'Os pagamentos comerciais ainda não estão activos.',METER_FORBIDDEN:'Não tem permissão para esta carteira.',METER_SUBSCRIPTION:'É necessária uma subscrição paga e activa.',ACCESS_EXISTS:'Já existe uma subscrição ou compra pendente. Actualize o estado ou utilize Gerir subscrição.',SEAT_LIMIT:'A empresa pode ter até três utilizadores, incluindo o titular.',INVALID:'Verifique os dados introduzidos.',TERMS:'Leia e aceite as condições antes de continuar.'};
function failure(e:unknown){const code=e instanceof Error?e.message:'';return json({error:messages[code]||'Não foi possível confirmar a operação. Actualize o estado antes de repetir.'},code==='METER_FORBIDDEN'?403:code==='INVALID'||code==='TERMS'?400:503);}
async function auth(){const client=await createClient(true);const auth=await client?.auth.getUser();const user=auth?.data.user;if(auth?.error||!user?.email_confirmed_at)throw Error('METER_FORBIDDEN');const db=createAdminClient();if(!db)throw Error('LIVE_DISABLED');return {user,db};}
export async function GET(request:Request){try{
 const {user,db}=await auth();let config;try{config=liveCreditConfig();}catch{/* Pausing new sales must not hide existing balances or cancellation. */}
 const session=new URL(request.url).searchParams.get('session_id');if(session&&config)await fulfillLiveCheckout(db,session,user.id);
 const r=await db.rpc('ai_meter_wallets',{p_actor:user.id});liveDb(r.error);
 const wallets=await Promise.all((r.data||[]).map(async(w:{id:string})=>{
  const owned=await db.from('ai_credit_wallets').select('owner_id,organization_id,live_subscription').eq('id',w.id).single();liveDb(owned.error);
  const isOwner=owned.data?.owner_id===user.id;
  let seats:unknown[]=[],members:unknown[]=[];
  if(isOwner&&owned.data?.organization_id){
   await ownedLiveWallet(db,user.id,w.id);
   const s=await db.from('ai_credit_seats').select('user_id').eq('wallet_id',w.id);liveDb(s.error);seats=s.data||[];
   const m=await db.from('organization_members').select('user_id,role').eq('organization_id',owned.data.organization_id);liveDb(m.error);members=m.data||[];
  }
  return {...w,isOwner,subscribed:!!owned.data?.live_subscription,seats,members};
 }));
 const orgs=await db.from('organization_members').select('organization_id').eq('user_id',user.id).eq('role','owner');liveDb(orgs.error);
 const ownedIds=wallets.filter(w=>w.isOwner).map(w=>w.id);
 const orders=ownedIds.length?await db.from('ai_credit_orders').select('id').in('wallet_id',ownedIds).eq('fulfilled',true).order('created_at',{ascending:false}).limit(100):{data:[],error:null};liveDb(orders.error);
 return json({enabled:!!config,wallets,settledOrderIds:(orders.data||[]).map(o=>o.id),organizations:orgs.data||[],terms:config?.terms,termsURL:config?.termsURL,userId:user.id});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==liveCreditOrigin||new URL(request.url).origin!==liveCreditOrigin)throw Error('METER_FORBIDDEN');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('INVALID');
 const {user,db}=await auth();
 const reader=request.body?.getReader();if(!reader)throw Error('INVALID');const chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();throw Error('INVALID');}chunks.push(value);}}finally{reader.releaseLock();}
 const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!b||typeof b!=='object'||Array.isArray(b))throw Error('INVALID');
 if(b.action==='portal'){if(!uuid(b.walletId))throw Error('INVALID');await ownedLiveWallet(db,user.id,b.walletId);return json({url:await livePortal(db,user.id,b.walletId)});}
 const config=liveCreditConfig();
 if(b.action==='open'){if(b.organizationId!=null&&!uuid(b.organizationId))throw Error('INVALID');const r=await db.rpc('ai_credit_open',{p_actor:user.id,p_org:b.organizationId||null});liveDb(r.error);return json({walletId:r.data});}
 if(!uuid(b.walletId))throw Error('INVALID');await ownedLiveWallet(db,user.id,b.walletId);
 if(b.action==='seat'){if(!uuid(b.memberId)||typeof b.add!=='boolean')throw Error('INVALID');const r=await db.rpc('ai_credit_member',{p_actor:user.id,p_wallet:b.walletId,p_member:b.memberId,p_add:b.add});liveDb(r.error);return json({saved:true});}
 if(b.action==='checkout'){
  if(b.terms!==config.terms)throw Error('TERMS');
  if(!uuid(b.requestId)||!['access','credits'].includes(b.kind)||(b.kind==='credits'&&![2000,5000,10000].includes(b.amountCents)))throw Error('INVALID');
  return json(await liveCheckout(db,{id:user.id,email:user.email},b.walletId,b.requestId,b.kind,b.amountCents));
 }
 throw Error('INVALID');
}catch(e){return failure(e);}}
