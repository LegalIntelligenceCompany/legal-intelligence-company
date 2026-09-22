// Deliberately isolated from production and from all paid AI routes.
import 'server-only';
import { billingAdmin, ensureCustomer, withBillingLock } from '@/lib/billing-store';
import { safeCheckoutURL, stripeTestRequest, subscriptionSnapshot } from '@/lib/billing';
import { getCommercialPlan, validateTestPlanPrice } from '@/lib/commercial-plans';
type DB = ReturnType<typeof billingAdmin>;
export type Wallet = { id:string; owner_id:string; organization_id:string|null; plan:'individual'|'business'; balance_cents:number; reserved_cents:number; active_until:string|null; frozen:boolean };
type Order = { id:string; wallet_id:string; kind:'access'|'credits'; amount_cents:number; customer_id:string; session_id:string|null; credited:boolean; created_at:string };
export const prepaidCodes = ['INVALID','FORBIDDEN','BUSY','CONFLICT','SEAT_LIMIT','FROZEN','SUBSCRIPTION_REQUIRED','INSUFFICIENT_CREDITS','DUPLICATE','SYNC_REQUIRED','CEILING_EXCEEDED','SETUP_REQUIRED','PROVIDER'] as const;
export function dbCheck(error:{message?:string}|null) {
 if(error) throw Error(prepaidCodes.find(c=>error.message?.includes(c))||'SETUP_REQUIRED');
}
export async function walletForOwner(db:DB, actor:string, id:string):Promise<Wallet> {
 const r=await db.from('prepaid_test_wallets').select('*').eq('id',id).eq('owner_id',actor).single();dbCheck(r.error);
 if(!r.data)throw Error('FORBIDDEN');
 if(r.data.organization_id){const m=await db.from('organization_members').select('role').eq('organization_id',r.data.organization_id).eq('user_id',actor).maybeSingle();dbCheck(m.error);if(m.data?.role!=='owner')throw Error('FORBIDDEN');}
 return r.data;
}
async function planPrice(planId:Wallet['plan']) {
 const plan=getCommercialPlan(planId);
 const r=await stripeTestRequest(`prices?${new URLSearchParams({'lookup_keys[]':plan.lookupKey,limit:'2'})}`);
 if(!Array.isArray(r.data)||r.has_more!==false||r.data.length!==1)throw Error('SETUP_REQUIRED');
 return validateTestPlanPrice(r.data[0],plan).priceId;
}
export async function syncWallet(db:DB,wallet:Wallet,customer:string,token:string) {
 const price=await planPrice(wallet.plan);
 const list=await stripeTestRequest(`subscriptions?customer=${customer}&status=all&limit=100&expand[]=data.latest_invoice`);
 if(!Array.isArray(list.data)||list.has_more!==false)throw Error('PROVIDER');
 const own=list.data.filter(s=>s.metadata?.lic_wallet_id===wallet.id);
 const rows=own.map(s=>subscriptionSnapshot(s,customer,price));
 const active=rows.filter(s=>s.paid&&Date.parse(s.period_start)<=Date.now()&&Date.parse(s.period_end)>Date.now()).sort((a,b)=>Date.parse(b.period_end)-Date.parse(a.period_end))[0];
 const r=await db.rpc('prepaid_test_access',{p_actor:wallet.owner_id,p_wallet:wallet.id,p_token:token,p_until:active?.period_end||null});dbCheck(r.error);
 return {price,hasSubscription:rows.some(s=>!['canceled','incomplete_expired'].includes(s.status)),hasHistory:rows.length>0};
}
export function checkoutBody(wallet:Wallet,order:Order,price:string,origin:string) {
 const body=new URLSearchParams({mode:order.kind==='access'?'subscription':'payment',customer:order.customer_id,
  client_reference_id:order.id,'metadata[lic_prepaid_order]':order.id,'metadata[lic_wallet_id]':wallet.id,
  'line_items[0][quantity]':'1','payment_method_types[0]':'card',locale:'pt',
  success_url:`${origin}/setup/credits?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}/setup/credits?cancelled=1`,
  'custom_text[submit][message]':'APENAS TESTE: não cobra dinheiro real nem permite usar IA paga.',
 });
 if(order.kind==='access'){
  body.set('line_items[0][price]',price);body.set('subscription_data[metadata][lic_wallet_id]',wallet.id);
 }else{
  body.set('line_items[0][price_data][currency]','eur');body.set('line_items[0][price_data][unit_amount]',String(order.amount_cents));
  body.set('line_items[0][price_data][product_data][name]','LIC — saldo pré-pago SIMULADO');
  body.set('line_items[0][price_data][tax_behavior]','exclusive');
 }
 return body;
}
export async function checkout(actor:string,walletId:string,id:string,kind:'access'|'credits',amount:number,origin:string) {
 return withBillingLock(actor,async(db,account)=>{
  const wallet=await walletForOwner(db,actor,walletId);
  const customer=await ensureCustomer(db,account);
  const state=await syncWallet(db,wallet,customer,account.lock_token);
  if(kind==='access'&&state.hasSubscription)throw Error('SUBSCRIPTION_REQUIRED');
  const cents=kind==='access'?getCommercialPlan(wallet.plan).monthlyCents:amount;
  // Access has one stable open order per wallet to prevent duplicate monthly
  // subscriptions even when different browser tabs generate different UUIDs.
  if(kind==='access'){
   const old=await db.from('prepaid_test_orders').select('*').eq('wallet_id',wallet.id).eq('kind','access').order('created_at',{ascending:false}).limit(1).maybeSingle();dbCheck(old.error);
   if(old.data){
    if(!old.data.session_id) id=old.data.id;
    else {const s=await stripeTestRequest(`checkout/sessions/${old.data.session_id}`);
     if(s.status==='open')return {url:safeCheckoutURL(s.url)};
     if(s.status==='complete'&&!state.hasHistory)throw Error('BUSY');
    }
   }
  }
  const r=await db.rpc('prepaid_test_order',{p_actor:actor,p_wallet:walletId,p_id:id,p_kind:kind,p_amount:cents,p_customer:customer});dbCheck(r.error);
  const order=r.data as Order;
  if(order.session_id){const s=await stripeTestRequest(`checkout/sessions/${order.session_id}`);if(s.status!=='open')throw Error('CONFLICT');return {url:safeCheckoutURL(s.url)};}
  // Stripe retains idempotency keys for a finite period. An uncertain old order
  // is NOT resubmitted after 23h, avoiding duplicate payments after key expiry.
  if(Date.now()-Date.parse(order.created_at)>23*3600000)throw Error('CONFLICT');
  const s=await stripeTestRequest('checkout/sessions',checkoutBody(wallet,order,state.price,origin),`lic-prepaid-${order.id}`);
  if(typeof s.id!=='string'||!/^cs_test_[A-Za-z0-9]+$/.test(s.id))throw Error('PROVIDER');
  const saved=await db.rpc('prepaid_test_bind',{p_id:order.id,p_session:s.id});dbCheck(saved.error);
  return {url:safeCheckoutURL(s.url)};
 });
}
export function verifiedCredit(session:Record<string,any>,order:Order) { // eslint-disable-line @typescript-eslint/no-explicit-any
 const pi=session.payment_intent,charge=pi?.latest_charge;
 if(session.livemode!==false||session.mode!=='payment'||session.status!=='complete'||session.payment_status!=='paid'||
  session.id!==order.session_id||session.client_reference_id!==order.id||session.metadata?.lic_prepaid_order!==order.id||session.metadata?.lic_wallet_id!==order.wallet_id||
  session.customer!==order.customer_id||session.currency!=='eur'||session.amount_subtotal!==order.amount_cents||session.amount_total!==order.amount_cents||
  session.total_details?.amount_discount!==0||session.total_details?.amount_tax!==0||
  pi?.livemode!==false||pi.status!=='succeeded'||pi.customer!==order.customer_id||pi.currency!=='eur'||pi.amount_received!==order.amount_cents||
  typeof pi.id!=='string'||!/^pi_[A-Za-z0-9]+$/.test(pi.id)||charge?.livemode!==false||charge.paid!==true||charge.amount!==order.amount_cents||
  charge.currency!=='eur'||charge.payment_intent!==pi.id||charge.customer!==order.customer_id||
  typeof charge.disputed!=='boolean'||!Number.isSafeInteger(charge.amount_refunded)||charge.amount_refunded<0)throw Error('CONFLICT');
 return {pi:pi.id as string,blocked:charge.disputed||charge.amount_refunded>0};
}
export async function fulfillSession(sessionId:string,actor?:string) {
 if(!/^cs_test_[A-Za-z0-9]+$/.test(sessionId))throw Error('INVALID');
 const db=billingAdmin();
 const session=await stripeTestRequest(`checkout/sessions/${sessionId}?expand[]=payment_intent.latest_charge`);
 const meta=session.metadata as Record<string,string>|null;
 if(!meta?.lic_prepaid_order)return; // Unrelated integration.
 const r=await db.from('prepaid_test_orders').select('*').eq('id',meta.lic_prepaid_order).single();dbCheck(r.error);
 const order=r.data as Order;
 const wr=await db.from('prepaid_test_wallets').select('*').eq('id',order.wallet_id).single();dbCheck(wr.error);const w=wr.data as Wallet;
 if(actor&&w.owner_id!==actor)throw Error('FORBIDDEN');
 if(session.customer!==order.customer_id||session.client_reference_id!==order.id||meta.lic_wallet_id!==w.id)throw Error('CONFLICT');
 if(order.session_id&&order.session_id!==sessionId)throw Error('CONFLICT');
 if(!order.session_id){const bound=await db.rpc('prepaid_test_bind',{p_id:order.id,p_session:sessionId});dbCheck(bound.error);order.session_id=sessionId;}
 if(order.kind==='credits'&&session.status==='complete'&&session.payment_status==='paid'){
  const paid=verifiedCredit(session,order);
  const credited=await db.rpc('prepaid_test_credit',{p_id:order.id,p_session:sessionId,p_customer:order.customer_id,p_pi:paid.pi,p_amount:order.amount_cents,p_blocked:paid.blocked});dbCheck(credited.error);
 }
 await withBillingLock(w.owner_id,async(admin,account)=>{if(account.customer_id!==order.customer_id)throw Error('CONFLICT');await syncWallet(admin,w,order.customer_id,account.lock_token);});
}
export async function refreshOwner(actor:string) {
 await withBillingLock(actor,async(db,account)=>{
  const r=await db.from('prepaid_test_wallets').select('*').eq('owner_id',actor);dbCheck(r.error);
  if(account.customer_id)for(const w of r.data||[])await syncWallet(db,w,account.customer_id,account.lock_token);
 });
 const db=billingAdmin();const r=await db.from('prepaid_test_wallets').select('*').eq('owner_id',actor);dbCheck(r.error);
 const wallets=[];
 for(const w of r.data||[]){
  const ledger=await db.from('prepaid_test_ledger').select('source,delta_cents,created_at').eq('wallet_id',w.id).order('id',{ascending:false}).limit(20);dbCheck(ledger.error);
  const seats=await db.from('prepaid_test_seats').select('user_id').eq('wallet_id',w.id);dbCheck(seats.error);
  wallets.push({...w,available_cents:w.balance_cents-w.reserved_cents,ledger:ledger.data,seats:seats.data});
 }
 return wallets;
}
