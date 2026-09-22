import { NextResponse } from 'next/server';
import { billingConfig,stripeTestRequest } from '@/lib/billing';
import { billingAdmin } from '@/lib/billing-store';
import { dbCheck,fulfillSession,refreshOwner } from '@/lib/prepaid-test';
import { readWebhookBody,verifyStripeEvent } from '@/lib/stripe-webhook';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
 let event;
 try{billingConfig();if(!process.env.STRIPE_CREDITS_WEBHOOK_SECRET?.startsWith('whsec_'))throw Error();}catch{return NextResponse.json({error:'Not configured'},{status:503});}
 try{event=verifyStripeEvent(await readWebhookBody(request),request.headers.get('stripe-signature'),process.env.STRIPE_CREDITS_WEBHOOK_SECRET!);}catch{return NextResponse.json({error:'Invalid event'},{status:400});}
 try{
  const o=event.data.object;
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
   if(typeof o.id!=='string')throw Error();await fulfillSession(o.id);
  }else if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','charge.refunded','charge.dispute.created'].includes(event.type)){
   const db=billingAdmin();let customer=o.customer;
   if(event.type==='charge.dispute.created'){
    // Disputes do not always include customer. Resolve the affected order by PI.
    if(typeof o.payment_intent!=='string')throw Error('PROVIDER');
    const frozen=await db.rpc('prepaid_test_freeze',{p_pi:o.payment_intent});dbCheck(frozen.error);
    // For access-subscription disputes we fail closed by resolving the charge.
    if(typeof o.charge!=='string'||!/^ch_[A-Za-z0-9]+$/.test(o.charge))throw Error('PROVIDER');
    customer=(await stripeTestRequest(`charges/${o.charge}`)).customer;
   }
   if(typeof customer!=='string'||!/^cus_[A-Za-z0-9]+$/.test(customer))throw Error('PROVIDER');
   const r=await db.from('billing_test_accounts').select('user_id').eq('customer_id',customer).maybeSingle();dbCheck(r.error);
   if(r.data){
    if(event.type==='charge.refunded'||event.type==='charge.dispute.created'){
     const frozen=await db.from('prepaid_test_wallets').update({frozen:true}).eq('owner_id',r.data.user_id);dbCheck(frozen.error);
    }
    await refreshOwner(r.data.user_id);
   }
  }else return NextResponse.json({ignored:true});
  return NextResponse.json({received:true});
 }catch{return NextResponse.json({error:'Retry later'},{status:503});}
}
