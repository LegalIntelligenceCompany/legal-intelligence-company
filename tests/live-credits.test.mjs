import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import ts from 'typescript';
function load(file,deps={},env={}){const out={};const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports','process',js)(id=>{if(!(id in deps))throw Error(id);return deps[id];},out,{env});return out;}
const deps={'server-only':{},'./billing':{},'./live-subscription':{}};
const api=load('../lib/live-credits.ts',deps);
test('unsupported top-ups are rejected before database or provider access',async()=>{
 for(const amount of [0,100,1999,2001,50000,NaN,Infinity,'2000'])await assert.rejects(api.liveCheckout(null,{id:'actor'},'wallet','request','credits',amount),/^Error: INVALID$/);
 for(const amount of [2000,5000,10000])await assert.rejects(api.liveCheckout(null,{id:'actor'},'wallet','request','credits',amount),/LIVE_DISABLED/);
});
test('live top-up needs matching paid live order, exact principal, tax and non-refunded charge',()=>{
 const order={id:'order',amount_cents:1000},wallet={id:'wallet',live_customer:'cus_one'};
 const charge={livemode:true,paid:true,customer:'cus_one',currency:'eur',amount_captured:1230,amount_refunded:0,disputed:false};
 const pi={id:'pi_one',livemode:true,status:'succeeded',customer:'cus_one',currency:'eur',amount_received:1230,latest_charge:charge};
 const s={livemode:true,mode:'payment',status:'complete',payment_status:'paid',currency:'eur',customer:'cus_one',client_reference_id:'order',metadata:{lic_live_order:'order',lic_wallet_id:'wallet'},amount_subtotal:1000,amount_total:1230,total_details:{amount_discount:0},automatic_tax:{status:'complete'},payment_intent:pi};
 assert.deepEqual(api.verifyLiveCredit(s,order,wallet),{payment:'pi_one',blocked:false});
 for(const patch of [{livemode:false},{customer:'cus_other'},{payment_status:'unpaid'},{amount_subtotal:999},{amount_total:999},{metadata:{lic_live_order:'other',lic_wallet_id:'wallet'}},{automatic_tax:{status:'failed'}},{total_details:{amount_discount:100}},{payment_intent:{...pi,livemode:false}},{payment_intent:{...pi,amount_received:1000}}])assert.throws(()=>api.verifyLiveCredit({...s,...patch},order,wallet),/METER_CONFLICT/);
 for(const c of [{...charge,amount_refunded:1},{...charge,disputed:true}])assert.equal(api.verifyLiveCredit({...s,payment_intent:{...pi,latest_charge:c}},order,wallet).blocked,true);
});
test('live checkout cannot activate by changing only an API key',()=>{
 assert.throws(()=>api.liveCreditConfig(),/LIVE_DISABLED/);
 const env={STRIPE_SECRET_KEY:'sk_live_fixture',LIC_LIVE_CHECKOUT_ENABLED:'true',LIC_LIVE_TAX_READY:'true',LIC_LIVE_TERMS_VERSION:'v1',LIC_LIVE_TERMS_URL:'https://legal-intelligence-company.vercel.app/terms',STRIPE_LIVE_CREDITS_TAX_CODE:'txcd_10000000'};
 assert.equal(load('../lib/live-credits.ts',deps,env).liveCreditConfig().terms,'v1');
 for(const patch of [{STRIPE_SECRET_KEY:'sk_test_fixture'},{LIC_LIVE_TAX_READY:'false'},{LIC_LIVE_TERMS_URL:'https://evil.example/terms'},{LIC_LIVE_TERMS_VERSION:''},{STRIPE_LIVE_CREDITS_TAX_CODE:''}])assert.throws(()=>load('../lib/live-credits.ts',deps,{...env,...patch}).liveCreditConfig(),/LIVE_DISABLED/);
});
test('webhook live and sandbox verification are strictly separated',()=>{
 const {verifyStripeEvent}=load('../lib/stripe-webhook.ts',{'node:crypto':{createHmac,timingSafeEqual:(a,b)=>a.equals(b)}});
 const now=Date.now(),t=Math.floor(now/1000),secret='whsec_fixture';
 for(const live of [false,true]){
  const body=JSON.stringify({id:'evt_fixture',livemode:live,type:'checkout.session.completed',data:{object:{id:'cs_fixture'}}});
  const header=`t=${t},v1=${createHmac('sha256',secret).update(`${t}.${body}`).digest('hex')}`;
  assert.equal(verifyStripeEvent(body,header,secret,now,live).livemode,live);
  assert.throws(()=>verifyStripeEvent(body,header,secret,now,!live),/EVENT/);
 }
});
