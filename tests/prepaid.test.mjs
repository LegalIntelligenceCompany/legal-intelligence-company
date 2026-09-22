import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {randomUUID,createHmac} from 'node:crypto';
function load(file,deps={}){const source=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('require','exports',source)(n=>{if(!(n in deps))throw Error(n);return deps[n];},exports);return exports;}
const catalogue=load('../lib/commercial-plans.ts');
const prepaid=load('../lib/prepaid-test.ts',{'server-only':{},'@/lib/billing-store':{},'@/lib/billing':{},'@/lib/commercial-plans':catalogue});
const wallet={id:randomUUID(),owner_id:randomUUID(),plan:'business'};
const order={id:randomUUID(),wallet_id:wallet.id,kind:'credits',amount_cents:1000,customer_id:'cus_a',session_id:'cs_test_a'};
function paid(){return {livemode:false,id:order.session_id,mode:'payment',status:'complete',payment_status:'paid',client_reference_id:order.id,metadata:{lic_prepaid_order:order.id,lic_wallet_id:wallet.id},customer:'cus_a',currency:'eur',amount_subtotal:1000,amount_total:1000,total_details:{amount_discount:0,amount_tax:0},payment_intent:{id:'pi_a',livemode:false,status:'succeeded',customer:'cus_a',currency:'eur',amount_received:1000,latest_charge:{livemode:false,paid:true,amount:1000,currency:'eur',payment_intent:'pi_a',customer:'cus_a',disputed:false,amount_refunded:0}}};}
test('prepaid checkout separates subscriptions and one-off credit and preserves 99 total company price',()=>{
 const body=prepaid.checkoutBody(wallet,order,'price_a','https://lic.test');
 assert.equal(body.get('mode'),'payment');assert.equal(body.get('line_items[0][price_data][unit_amount]'),'1000');assert.equal(body.get('line_items[0][quantity]'),'1');
 assert.equal(body.get('metadata[lic_prepaid_order]'),order.id);assert.equal(body.get('payment_method_types[0]'),'card');
 const access=prepaid.checkoutBody(wallet,{...order,kind:'access',amount_cents:9900},'price_company','https://lic.test');
 assert.equal(access.get('mode'),'subscription');assert.equal(access.get('line_items[0][price]'),'price_company');assert.equal(access.get('line_items[0][quantity]'),'1');
 assert.equal(access.get('subscription_data[metadata][lic_wallet_id]'),wallet.id);assert.equal(access.get('line_items[0][price_data][unit_amount]'),null);
});
test('credit requires complete verified payment, exact owner/order/amount/currency and test mode',()=>{
 assert.deepEqual(prepaid.verifiedCredit(paid(),order),{pi:'pi_a',blocked:false});
 for(const patch of [{livemode:true},{status:'open'},{payment_status:'unpaid'},{customer:'cus_other'},{mode:'subscription'},{amount_total:999},{amount_subtotal:999},{currency:'usd'},{client_reference_id:'other'},{id:'cs_test_other'},{metadata:{}},{total_details:{amount_discount:1,amount_tax:0}},{total_details:{amount_discount:0,amount_tax:1}},{payment_intent:null}])assert.throws(()=>prepaid.verifiedCredit({...paid(),...patch},order),/CONFLICT/);
 for(const patch of [{livemode:true},{amount_received:999},{customer:'cus_other'},{status:'processing'},{currency:'usd'},{latest_charge:null},{id:'invalid'}]){const s=paid();Object.assign(s.payment_intent,patch);assert.throws(()=>prepaid.verifiedCredit(s,order),/CONFLICT/);}
 for(const patch of [{paid:false},{amount:999},{customer:'cus_other'},{payment_intent:'pi_other'},{disputed:undefined},{amount_refunded:-1}]){const s=paid();Object.assign(s.payment_intent.latest_charge,patch);assert.throws(()=>prepaid.verifiedCredit(s,order),/CONFLICT/);}
 for(const patch of [{disputed:true},{amount_refunded:1}]){const s=paid();Object.assign(s.payment_intent.latest_charge,patch);assert.equal(prepaid.verifiedCredit(s,order).blocked,true);}
});
test('fulfillment fetches fresh Stripe state; unpaid, foreign and refunded payments cannot unlock spending',async()=>{
 const calls=[],reads=[];let current=paid();
 const db={from:table=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:table==='prepaid_test_orders'?order:wallet,error:null})};return q;},rpc:async(name,args)=>{calls.push({name,args});return {error:null};}};
 const plan=catalogue.commercialPlans[1];
 const module=load('../lib/prepaid-test.ts',{'server-only':{},'@/lib/commercial-plans':catalogue,
  '@/lib/billing-store':{billingAdmin:()=>db,withBillingLock:async(actor,work)=>work(db,{customer_id:'cus_a',lock_token:'lease'})},
  '@/lib/billing':{stripeTestRequest:async path=>{reads.push(path);if(path.startsWith('checkout/'))return current;if(path.startsWith('prices?'))return {has_more:false,data:[{id:'price_business',livemode:false,active:true,currency:'eur',unit_amount:9900,billing_scheme:'per_unit',tax_behavior:'exclusive',lookup_key:plan.lookupKey,recurring:{interval:'month',interval_count:1,usage_type:'licensed'},metadata:{lic_plan:'business',lic_seats:'3',lic_scope:'organization'}}]};return {data:[],has_more:false};}},
 });
 current.payment_status='unpaid';await module.fulfillSession(order.session_id,wallet.owner_id);assert.equal(calls.some(c=>c.name==='prepaid_test_credit'),false);
 current=paid();await assert.rejects(module.fulfillSession(order.session_id,randomUUID()),/FORBIDDEN/);
 await module.fulfillSession(order.session_id,wallet.owner_id);assert.equal(calls.filter(c=>c.name==='prepaid_test_credit').length,1);
 current.payment_intent.latest_charge.amount_refunded=100;
 await module.fulfillSession(order.session_id);assert.equal(calls.filter(c=>c.name==='prepaid_test_credit').at(-1).args.p_blocked,true);
 assert.equal(reads.filter(p=>p.startsWith('checkout/')).length,4);
 assert.ok(reads.filter(p=>p.startsWith('checkout/')).every(p=>p.includes('expand[]=payment_intent.latest_charge')));
});
function api(options={}){
 const calls=[];const user=options.user===undefined?{id:wallet.owner_id,email:'owner@test',email_confirmed_at:'yes'}:options.user;
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='prepaid_test_settle'?30:true,error:options.noBalance&&name==='prepaid_test_reserve'?{message:'INSUFFICIENT_CREDITS'}:null};}};
 const route=load('../app/api/credits/route.ts',{
  'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},
  '@/lib/billing':{billingConfig:()=>{if(options.live)throw Error('NOT_CONFIGURED');return {tester:'owner@test'};},isBillingTester:(email,tester)=>email===tester},
  '@/lib/billing-store':{billingAdmin:()=>db},
  '@/lib/prepaid-test':{...prepaid,walletForOwner:async()=>{if(options.otherWallet)throw Error('FORBIDDEN');return wallet;},refreshOwner:async()=>[],fulfillSession:async()=>{},checkout:async(...args)=>{calls.push({name:'checkout',args});return {url:'https://checkout.stripe.com/test'};}},
 });return {route,calls};
}
const post=(data,origin='https://lic.test')=>new Request('https://lic.test/api/credits',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
test('credit actions enforce confirmed test owner, CSRF, size and ownership before accounting',async()=>{
 const body={action:'simulate',walletId:wallet.id,requestId:randomUUID()};
 for(const options of [{user:null},{user:{email:'owner@test'}},{user:{email:'other@test',email_confirmed_at:'yes'}},{live:true},{otherWallet:true}]){const {route,calls}=api(options);assert.ok((await route.POST(post(body))).status>=400);assert.equal(calls.length,0);}
 const {route,calls}=api();assert.equal((await route.POST(post(body,'https://evil.test'))).status,403);
 assert.equal((await route.POST(post({...body,padding:'x'.repeat(5000)}))).status,400);assert.equal(calls.length,0);
 for(const amount of [-1,0,99,50001,1.5,'100'])assert.equal((await route.POST(post({action:'checkout',walletId:wallet.id,requestId:randomUUID(),kind:'credits',amountCents:amount}))).status,400);
});
test('simulation reserves server ceiling before settling server cost; no balance blocks settlement',async()=>{
 const body={action:'simulate',walletId:wallet.id,requestId:randomUUID(),amountCents:0,cost:0,ceiling:0};
 const {route,calls}=api();const r=await route.POST(post(body));assert.equal(r.status,200);assert.equal((await r.json()).aiCalled,false);
 assert.deepEqual(calls.map(c=>c.name),['prepaid_test_reserve','prepaid_test_settle']);assert.equal(calls[0].args.p_ceiling,60);assert.equal(calls[1].args.p_cost_micros,100000);
 const blocked=api({noBalance:true});assert.equal((await blocked.route.POST(post(body))).status,402);assert.equal(blocked.calls.length,1);
});
const verifier=load('../lib/stripe-webhook.ts',{'node:crypto':{createHmac,timingSafeEqual:(await import('node:crypto')).timingSafeEqual}});
test('wallet webhook verifies raw signature, rejects live events and retries failed persistence',async()=>{
 const prior=process.env.STRIPE_CREDITS_WEBHOOK_SECRET;process.env.STRIPE_CREDITS_WEBHOOK_SECRET='whsec_prepaid';
 let calls=0,fail=false;
 const route=load('../app/api/credits/webhook/route.ts',{
  'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},'@/lib/billing':{billingConfig:()=>({})},'@/lib/billing-store':{},
  '@/lib/stripe-webhook':verifier,'@/lib/prepaid-test':{fulfillSession:async()=>{calls++;if(fail)throw Error();}},
 });
 const req=(live=false,bad=false)=>{const raw=JSON.stringify({id:'evt_test',type:'checkout.session.completed',livemode:live,data:{object:{id:'cs_test_a'}}});const t=Math.floor(Date.now()/1000);const v=createHmac('sha256','whsec_prepaid').update(t+'.'+raw).digest('hex');return new Request('https://lic.test/api/credits/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${bad?'0'.repeat(64):v}`},body:raw});};
 try{
  assert.equal((await route.POST(req(false,true))).status,400);assert.equal((await route.POST(req(true))).status,400);assert.equal(calls,0);
  assert.equal((await route.POST(req())).status,200);fail=true;assert.equal((await route.POST(req())).status,503);
 }finally{if(prior===undefined)delete process.env.STRIPE_CREDITS_WEBHOOK_SECRET;else process.env.STRIPE_CREDITS_WEBHOOK_SECRET=prior;}
});
