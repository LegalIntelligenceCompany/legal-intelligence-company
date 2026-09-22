import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function load(file, deps={}) {
 const source=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',source)(name=>{if(!(name in deps))throw Error(name);return deps[name];},exports);return exports;
}
const catalogue=load('../lib/commercial-plans.ts');
test('access subscriptions include zero AI credits and do not enable commercial inference',()=>{
 assert.deepEqual(catalogue.commercialConsumptionPolicy,{
  subscriptionPurpose:'platform_access',includedAICredits:0,consumptionPayment:'prepaid_separately',
  providerCostMultiplier:3,allowNegativeBalance:false,automaticTopUp:false,commercialInferenceEnabled:false,
 });
});
test('AI consumption uses approved 3x cost, rounded up once to EUR cents excluding tax',()=>{
 assert.deepEqual(catalogue.quoteAIConsumption(1000000),{providerCostEuroMicros:1000000,customerBaseCents:300,currency:'eur',taxIncluded:false});
 for(const [cost,cents] of [[0,0],[1,1],[3333,1],[3334,2],[10000,3],[10001,4],[2500000,750]])assert.equal(catalogue.quoteAIConsumption(cost).customerBaseCents,cents);
 for(const cost of [-1,NaN,Infinity,0.5,'100',null,undefined,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>catalogue.quoteAIConsumption(cost),/INVALID_PROVIDER_COST/);
 assert.equal(catalogue.quoteAIConsumption(Number.MAX_SAFE_INTEGER).customerBaseCents,Number((BigInt(Number.MAX_SAFE_INTEGER)*3n+9999n)/10000n));
});
function price(plan,patch={}) {return {id:`price_${plan.id}`,livemode:false,active:true,currency:'eur',unit_amount:plan.monthlyCents,billing_scheme:'per_unit',tax_behavior:'exclusive',lookup_key:plan.lookupKey,recurring:{interval:'month',interval_count:1,usage_type:'licensed'},metadata:{lic_plan:plan.id,lic_seats:String(plan.seats),lic_scope:plan.scope},...patch};}
test('approved plans are monthly base prices; company is 99 total for three seats',()=>{
 assert.deepEqual(catalogue.commercialPlans.map(p=>[p.id,p.monthlyCents,p.seats]),[['individual',4900,1],['business',9900,3]]);
 assert.throws(()=>catalogue.getCommercialPlan('arbitrary'),/INVALID_PLAN/);
 for(const plan of catalogue.commercialPlans){const body=catalogue.testPlanPriceBody(plan);assert.equal(body.get('unit_amount'),String(plan.monthlyCents));assert.equal(body.get('tax_behavior'),'exclusive');assert.equal(body.get('recurring[interval]'),'month');assert.equal(body.get('transfer_lookup_key'),null);assert.equal(body.get('metadata[lic_seats]'),String(plan.seats));}
});
test('catalogue refuses live, wrong price, tax, frequency and seat configuration',()=>{
 const plan=catalogue.commercialPlans[1];assert.equal(catalogue.validateTestPlanPrice(price(plan),plan).amount,9900);
 for(const patch of [{livemode:true},{active:false},{currency:'usd'},{unit_amount:29700},{tax_behavior:'inclusive'},{lookup_key:'other'},{metadata:{lic_plan:'business',lic_seats:'1',lic_scope:'organization'}},{recurring:{interval:'year',interval_count:1,usage_type:'licensed'}},{transform_quantity:{divide_by:3}},{custom_unit_amount:{enabled:true}}])assert.throws(()=>catalogue.validateTestPlanPrice(price(plan,patch),plan),/PLAN_MISMATCH/);
});
function route(options={}) {
 const calls=[];const saved=new Map();
 const user=options.user===undefined?{id:'owner',email:'owner@example.com',email_confirmed_at:'yes'}:options.user;
 const stripe=async(path,body,key)=>{
  calls.push({path,body,key});
  if(path.startsWith('prices?')){const lookup=new URLSearchParams(path.split('?')[1]).get('lookup_keys[]');const plan=catalogue.commercialPlans.find(p=>p.lookupKey===lookup);return {data:options.conflict?[price(plan,{unit_amount:1})]:saved.has(lookup)?[saved.get(lookup)]:[],has_more:false};}
  assert.equal(path,'prices');assert.ok(key.startsWith('lic-catalogue-'));const plan=catalogue.commercialPlans.find(p=>p.lookupKey===body.get('lookup_key'));const p=price(plan);saved.set(plan.lookupKey,p);return p;
 };
 const r=load('../app/api/billing/plans/route.ts',{
  'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},
  '@/lib/billing':{billingConfig:()=>{if(options.live)throw Error('NOT_CONFIGURED');return {tester:'owner@example.com'};},isBillingTester:(email,tester)=>email===tester,stripeTestRequest:stripe},
  '@/lib/billing-store':{withBillingLock:async(id,work)=>{assert.equal(id,'owner');if(options.busy)throw Error('BUSY');return work();}},
  '@/lib/commercial-plans':catalogue,
 });return {r,calls};
}
const request=(origin='https://lic.test')=>new Request('https://lic.test/api/billing/plans',{method:'POST',headers:{origin}});
test('GET is read-only; repeated provisioning returns same prices without creating subscriptions',async()=>{
 const {r,calls}=route();assert.equal((await r.GET()).status,200);assert.equal(calls.filter(c=>c.body).length,0);
 const first=await (await r.POST(request())).json();assert.equal(first.commercialCheckoutEnabled,false);assert.equal(first.plans.length,2);
 assert.deepEqual(first.consumptionPolicy,catalogue.commercialConsumptionPolicy);
 const again=await (await r.POST(request())).json();assert.deepEqual(again,first);assert.equal(calls.filter(c=>c.body).length,2);
 assert.ok(calls.every(c=>c.path.startsWith('prices')));
});
test('authentication, confirmed owner, CSRF, test config and lock prevent provisioning',async()=>{
 for(const [options,status] of [[{user:null},401],[{user:{id:'other',email:'other@example.com',email_confirmed_at:'yes'}},403],[{user:{id:'owner',email:'owner@example.com'}},403],[{live:true},503],[{busy:true},409]]){const {r,calls}=route(options);assert.equal((await r.POST(request())).status,status);assert.equal(calls.length,0);}
 const {r,calls}=route();assert.equal((await r.POST(request('https://evil.test'))).status,403);assert.equal(calls.length,0);
});
test('conflicting existing prices are not overwritten or silently duplicated',async()=>{
 const {r,calls}=route({conflict:true});assert.equal((await r.POST(request())).status,409);assert.equal(calls.filter(c=>c.body).length,0);
});
