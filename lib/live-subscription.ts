// A fresh read-only Stripe check before each commercial reservation. No
// subscription/charge is created here; sandbox objects never grant access.
type ObjectValue = Record<string, unknown>;
function obj(value:unknown):ObjectValue {return value&&typeof value==='object'&&!Array.isArray(value)?value as ObjectValue:{};}
export function verifiedLivePeriod(raw:unknown,expected:{customer:string;subscription:string;price:string;company:boolean},now=Date.now()) {
 const s=obj(raw),items=obj(s.items),data=items.data;
 const item=obj(Array.isArray(data)&&data.length===1?data[0]:null),price=obj(item.price),recurring=obj(price.recurring),invoice=obj(s.latest_invoice);
 const parent=obj(obj(invoice.parent).subscription_details);
 const start=item.current_period_start??s.current_period_start,end=item.current_period_end??s.current_period_end;
 const amount=expected.company?9900:4900;
 if(s.livemode!==true||s.id!==expected.subscription||s.customer!==expected.customer||s.status!=='active'||s.pause_collection||s.pending_update||
  item.quantity!==1||price.id!==expected.price||price.livemode!==true||price.currency!=='eur'||price.unit_amount!==amount||price.billing_scheme!=='per_unit'||price.tax_behavior!=='exclusive'||
  price.transform_quantity||recurring.interval!=='month'||recurring.interval_count!==1||recurring.usage_type!=='licensed'||
  invoice.livemode!==true||invoice.customer!==expected.customer||(invoice.subscription??parent.subscription)!==expected.subscription||
  invoice.status!=='paid'||invoice.currency!=='eur'||invoice.subtotal!==amount||typeof invoice.amount_paid!=='number'||invoice.amount_paid<amount||
  typeof start!=='number'||typeof end!=='number'||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start*1000>now||end*1000<=now)throw Error('METER_SUBSCRIPTION');
 return new Date(end*1000).toISOString();
}
export async function readLivePeriod(wallet:{live_customer:string|null;live_subscription:string|null;organization_id:string|null}) {
 const key=process.env.STRIPE_SECRET_KEY,price=process.env[wallet.organization_id?'STRIPE_LIVE_BUSINESS_PRICE_ID':'STRIPE_LIVE_INDIVIDUAL_PRICE_ID'];
 if(!key?.startsWith('sk_live_')||!price||!/^price_[A-Za-z0-9]+$/.test(price))throw Error('METER_SETUP');
 if(!wallet.live_customer||!/^cus_[A-Za-z0-9]+$/.test(wallet.live_customer)||!wallet.live_subscription||!/^sub_[A-Za-z0-9]+$/.test(wallet.live_subscription))throw Error('METER_SUBSCRIPTION');
 const response=await fetch(`https://api.stripe.com/v1/subscriptions/${wallet.live_subscription}?expand%5B%5D=latest_invoice`,{
  headers:{Authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error',
 });
 if(!response.ok)throw Error('METER_SUBSCRIPTION');
 return verifiedLivePeriod(await response.json(),{customer:wallet.live_customer,subscription:wallet.live_subscription,price,company:!!wallet.organization_id});
}
