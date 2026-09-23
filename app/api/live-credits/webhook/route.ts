import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {fulfillLiveCheckout,liveStripe,liveDb} from '@/lib/live-credits';
import {readWebhookBody,verifyStripeEvent} from '@/lib/stripe-webhook';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 const secret=process.env.STRIPE_LIVE_CREDITS_WEBHOOK_SECRET;
 if(!secret?.startsWith('whsec_')||!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_'))return NextResponse.json({error:'Not configured'},{status:503});
 let event;try{event=verifyStripeEvent(await readWebhookBody(request),request.headers.get('stripe-signature'),secret,Date.now(),true);}catch{return NextResponse.json({error:'Invalid event'},{status:400});}
 try{
  const o=event.data.object;
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
   if(typeof o.id!=='string')throw Error();await fulfillLiveCheckout(createAdminClient()!,o.id);
  }else if(['charge.refunded','charge.dispute.created'].includes(event.type)){
   const id=event.type==='charge.refunded'?o.id:o.charge;if(typeof id!=='string'||!/^ch_[A-Za-z0-9]+$/.test(id))throw Error();
   const charge=await liveStripe(`charges/${id}`);if(charge.livemode!==true||typeof charge.customer!=='string')throw Error();
   if(charge.disputed===true||charge.amount_refunded>0){const db=createAdminClient();if(!db)throw Error();const r=await db.from('ai_credit_wallets').update({frozen:true}).eq('live_customer',charge.customer);liveDb(r.error);}
  }else return NextResponse.json({ignored:true});
  return NextResponse.json({received:true});
 }catch{return NextResponse.json({error:'Retry later'},{status:503});}
}
