import 'server-only';
import type {createAdminClient} from './supabase/admin';
import {safeCheckoutURL,safePortalURL} from './billing';
import {readLivePeriod} from './live-subscription';
type DB=NonNullable<ReturnType<typeof createAdminClient>>;
type Wallet={id:string;owner_id:string;organization_id:string|null;live_customer:string|null;live_subscription:string|null;frozen:boolean};
type Order={id:string;wallet_id:string;kind:'access'|'credits';amount_cents:number;session_id:string|null;fulfilled:boolean;closed:boolean;created_at:string};
// Stripe payloads are external data; every security-sensitive field below is
// checked explicitly before any SQL credit/access operation.
type StripeObject=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const liveCreditOrigin='https://legal-intelligence-company.vercel.app';
export function liveCreditConfig(){
 const terms=process.env.LIC_LIVE_TERMS_VERSION,termsURL=process.env.LIC_LIVE_TERMS_URL;
 if(process.env.LIC_LIVE_CHECKOUT_ENABLED!=='true'||process.env.LIC_LIVE_TAX_READY!=='true'||!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')||!terms||!termsURL||!/^txcd_\d+$/.test(process.env.STRIPE_LIVE_CREDITS_TAX_CODE||''))throw Error('LIVE_DISABLED');
 const url=new URL(termsURL);if(url.origin!==liveCreditOrigin||url.username||url.password)throw Error('LIVE_DISABLED');
 return {terms,termsURL:url.href};
}
export function liveDb(error:{message?:string}|null){if(error)throw Error(['METER_FORBIDDEN','METER_SUBSCRIPTION','METER_CONFLICT','ACCESS_EXISTS','SEAT_LIMIT'].find(code=>error.message?.includes(code))||'METER_UNCONFIRMED');}
export async function liveStripe(path:string,body?:URLSearchParams,idempotency?:string):Promise<StripeObject>{
 const key=process.env.STRIPE_SECRET_KEY;if(!key?.startsWith('sk_live_'))throw Error('LIVE_DISABLED');
 const response=await fetch(`https://api.stripe.com/v1/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('METER_UNCONFIRMED');return response.json();
}
export async function ownedLiveWallet(db:DB,actor:string,id:string):Promise<Wallet>{
 const result=await db.from('ai_credit_wallets').select('*').eq('id',id).eq('owner_id',actor).single();liveDb(result.error);
 if(!result.data)throw Error('METER_FORBIDDEN');const wallet=result.data as Wallet;
 if(wallet.organization_id){const member=await db.from('organization_members').select('role').eq('organization_id',wallet.organization_id).eq('user_id',actor).eq('role','owner').maybeSingle();if(member.error||!member.data)throw Error('METER_FORBIDDEN');}
 return wallet;
}
async function accessPrice(wallet:Wallet){
 const id=process.env[wallet.organization_id?'STRIPE_LIVE_BUSINESS_PRICE_ID':'STRIPE_LIVE_INDIVIDUAL_PRICE_ID'];if(!id||!/^price_[A-Za-z0-9]+$/.test(id))throw Error('LIVE_DISABLED');
 const p=await liveStripe(`prices/${id}`);
 if(p.livemode!==true||p.active!==true||p.currency!=='eur'||p.unit_amount!==(wallet.organization_id?9900:4900)||p.billing_scheme!=='per_unit'||p.tax_behavior!=='exclusive'||p.recurring?.interval!=='month'||p.recurring?.interval_count!==1||p.recurring?.usage_type!=='licensed'||p.transform_quantity)throw Error('LIVE_DISABLED');
 return id;
}
export async function liveCheckout(db:DB,actor:{id:string;email?:string},walletId:string,requestId:string,kind:'access'|'credits',amount:number){
 const config=liveCreditConfig();let wallet=await ownedLiveWallet(db,actor.id,walletId);if(wallet.frozen)throw Error('METER_FORBIDDEN');
 if(kind==='access'&&wallet.live_subscription){
  const sub=await liveStripe(`subscriptions/${wallet.live_subscription}`);
  if(sub.livemode!==true||sub.id!==wallet.live_subscription||sub.customer!==wallet.live_customer||sub.status!=='canceled')throw Error('ACCESS_EXISTS');
  const closed=await db.rpc('ai_credit_close_access',{p_actor:actor.id,p_wallet:wallet.id,p_subscription:wallet.live_subscription});liveDb(closed.error);
  wallet=await ownedLiveWallet(db,actor.id,walletId);
 }
 const price=kind==='access'?await accessPrice(wallet):null;
 if(kind==='credits'){
  const until=await readLivePeriod(wallet);const synced=await db.from('ai_credit_wallets').update({active_until:until}).eq('id',wallet.id);liveDb(synced.error);
 }
 // Reuse pending subscription checkout. Never create a second subscription
 // because the browser missed the first redirect or webhook.
 if(kind==='access'){
  const existing=await db.from('ai_credit_orders').select('*').eq('wallet_id',wallet.id).eq('kind','access').eq('closed',false).maybeSingle();liveDb(existing.error);
  if(existing.data){
   const old=existing.data as Order;
   if(old.fulfilled||wallet.live_subscription)throw Error('ACCESS_EXISTS');
   if(old.session_id){const s=await liveStripe(`checkout/sessions/${old.session_id}`);
    if(s.livemode!==true||s.metadata?.lic_live_order!==old.id)throw Error('METER_CONFLICT');
    if(s.status==='expired'){const closed=await db.from('ai_credit_orders').update({closed:true}).eq('id',old.id).eq('fulfilled',false);liveDb(closed.error);}
    else requestId=old.id;
   }else requestId=old.id;
  }
 }
 const created=await db.rpc('ai_credit_order',{p_actor:actor.id,p_wallet:wallet.id,p_id:requestId,p_kind:kind,p_amount:kind==='access'?(wallet.organization_id?9900:4900):amount});liveDb(created.error);
 const order=created.data as Order;if(!order?.id||order.closed||order.fulfilled)throw Error('METER_CONFLICT');
 if(order.session_id){const s=await liveStripe(`checkout/sessions/${order.session_id}`);if(s.livemode!==true||s.status!=='open'||s.metadata?.lic_live_order!==order.id)throw Error('METER_CONFLICT');return {url:safeCheckoutURL(s.url)};}
 if(Date.now()-Date.parse(order.created_at)>23*3600000)throw Error('METER_UNCONFIRMED');
 const body=new URLSearchParams({mode:kind==='access'?'subscription':'payment',client_reference_id:order.id,
  'metadata[lic_live_order]':order.id,'metadata[lic_wallet_id]':wallet.id,'metadata[lic_terms_version]':config.terms,
  'line_items[0][quantity]':'1','automatic_tax[enabled]':'true','tax_id_collection[enabled]':'true',billing_address_collection:'required',
  success_url:`${liveCreditOrigin}/credits?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${liveCreditOrigin}/credits`,locale:'pt'});
 if(wallet.live_customer){body.set('customer',wallet.live_customer);body.set('customer_update[address]','auto');body.set('customer_update[name]','auto');}
 else if(actor.email)body.set('customer_email',actor.email);else throw Error('METER_FORBIDDEN');
 if(kind==='access')body.set('line_items[0][price]',price!);
 else {
  body.set('line_items[0][price_data][currency]','eur');body.set('line_items[0][price_data][unit_amount]',String(order.amount_cents));
  body.set('line_items[0][price_data][tax_behavior]','exclusive');body.set('line_items[0][price_data][product_data][name]','Créditos de consumo LIC');
  body.set('line_items[0][price_data][product_data][tax_code]',process.env.STRIPE_LIVE_CREDITS_TAX_CODE!);
 }
 const s=await liveStripe('checkout/sessions',body,`lic-live-order-${order.id}`);
 if(s.livemode!==true||typeof s.id!=='string'||!/^cs_live_[A-Za-z0-9]+$/.test(s.id)||s.client_reference_id!==order.id)throw Error('METER_CONFLICT');
 const bound=await db.rpc('ai_credit_bind',{p_id:order.id,p_session:s.id});liveDb(bound.error);return {url:safeCheckoutURL(s.url)};
}
export function verifyLiveCredit(session:StripeObject,order:Order,wallet:Wallet){
 const pi=session.payment_intent,charge=pi?.latest_charge;
 if(session.livemode!==true||session.mode!=='payment'||session.status!=='complete'||session.payment_status!=='paid'||session.currency!=='eur'||
 session.client_reference_id!==order.id||session.metadata?.lic_live_order!==order.id||session.metadata?.lic_wallet_id!==wallet.id||session.customer!==wallet.live_customer||
 session.amount_subtotal!==order.amount_cents||session.total_details?.amount_discount!==0||!Number.isSafeInteger(session.amount_total)||session.amount_total<order.amount_cents||session.automatic_tax?.status!=='complete'||
 pi?.livemode!==true||pi.status!=='succeeded'||pi.customer!==wallet.live_customer||pi.currency!=='eur'||pi.amount_received!==session.amount_total||
 typeof pi.id!=='string'||!/^pi_[A-Za-z0-9]+$/.test(pi.id)||charge?.livemode!==true||charge.paid!==true||charge.customer!==wallet.live_customer||charge.currency!=='eur'||charge.amount_captured!==session.amount_total||
 !Number.isSafeInteger(charge.amount_refunded)||charge.amount_refunded<0)throw Error('METER_CONFLICT');
 return {payment:pi.id as string,blocked:charge.disputed===true||charge.refunded===true||charge.amount_refunded>0};
}
export async function fulfillLiveCheckout(db:DB,sessionId:string,actor?:string){
 if(!/^cs_live_[A-Za-z0-9]+$/.test(sessionId))throw Error('METER_CONFLICT');
 const s=await liveStripe(`checkout/sessions/${sessionId}?expand%5B%5D=payment_intent.latest_charge`);
 if(s.livemode!==true)throw Error('METER_CONFLICT');if(!s.metadata?.lic_live_order)return;
 const found=await db.from('ai_credit_orders').select('*').eq('id',s.metadata.lic_live_order).single();liveDb(found.error);const order=found.data as Order;
 if(!order||order.closed)throw Error('METER_CONFLICT');
 const stored=await db.from('ai_credit_wallets').select('*').eq('id',order.wallet_id).single();liveDb(stored.error);const wallet=stored.data as Wallet;
 if(!wallet||(actor&&wallet.owner_id!==actor)||s.metadata.lic_wallet_id!==wallet.id||s.client_reference_id!==order.id||s.amount_subtotal!==order.amount_cents)throw Error('METER_FORBIDDEN');
 const bound=await db.rpc('ai_credit_bind',{p_id:order.id,p_session:sessionId});liveDb(bound.error);
 if(s.status!=='complete'||s.payment_status!=='paid')return;
 if(order.kind==='access'&&order.fulfilled)return;
 let payment:string,until:string|null=null,blocked=false;
 if(order.kind==='credits'){({payment,blocked}=verifyLiveCredit(s,order,wallet));}
 else {
  if(s.mode!=='subscription'||s.currency!=='eur'||s.automatic_tax?.status!=='complete'||typeof s.customer!=='string'||!/^cus_[A-Za-z0-9]+$/.test(s.customer)||typeof s.subscription!=='string'||!/^sub_[A-Za-z0-9]+$/.test(s.subscription))throw Error('METER_CONFLICT');
  until=await readLivePeriod({...wallet,live_customer:s.customer,live_subscription:s.subscription});payment=s.subscription;
 }
 const saved=await db.rpc('ai_credit_fulfill',{p_id:order.id,p_session:sessionId,p_customer:s.customer,p_payment:payment,p_until:until,p_blocked:blocked});liveDb(saved.error);
}
export async function livePortal(db:DB,actor:string,walletId:string){
 const wallet=await ownedLiveWallet(db,actor,walletId);if(!wallet.live_customer)throw Error('METER_SUBSCRIPTION');
 const session=await liveStripe('billing_portal/sessions',new URLSearchParams({customer:wallet.live_customer,return_url:`${liveCreditOrigin}/credits`,locale:'pt'}));return safePortalURL(session.url);
}
