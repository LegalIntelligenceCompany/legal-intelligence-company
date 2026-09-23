import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={},env={}){const out={};const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports','process',js)(id=>{if(!(id in deps))throw Error(id);return deps[id];},out,{env});return out;}
const cost=load('../lib/inference-cost.ts');
const live=load('../lib/live-subscription.ts');
test('live access requires correct paid subscription, live price, quantity and period',()=>{
 const expected={customer:'cus_one',subscription:'sub_one',price:'price_one',company:false};
 const now=Date.now(),start=Math.floor(now/1000)-10,end=Math.floor(now/1000)+86400;
 const raw={id:'sub_one',customer:'cus_one',livemode:true,status:'active',items:{data:[{quantity:1,current_period_start:start,current_period_end:end,price:{id:'price_one',livemode:true,currency:'eur',unit_amount:4900,billing_scheme:'per_unit',tax_behavior:'exclusive',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}}}]},latest_invoice:{livemode:true,customer:'cus_one',subscription:'sub_one',status:'paid',currency:'eur',subtotal:4900,amount_paid:6027}};
 assert.equal(live.verifiedLivePeriod(raw,expected,now),new Date(end*1000).toISOString());
 for(const patch of [{livemode:false},{customer:'cus_other'},{status:'canceled'},{pause_collection:{}},{latest_invoice:{...raw.latest_invoice,status:'open'}},{items:{data:[{...raw.items.data[0],quantity:3}]}},{items:{data:[{...raw.items.data[0],current_period_end:start}]}},{latest_invoice:{...raw.latest_invoice,amount_paid:0}}])assert.throws(()=>live.verifiedLivePeriod({...raw,...patch},expected,now),/METER_SUBSCRIPTION/);
 assert.throws(()=>live.verifiedLivePeriod(raw,{...expected,company:true},now),/METER_SUBSCRIPTION/);
});
function setup(patch={}){
 const calls=[];
 const tariff={id:'synthetic',model:'gpt-5-mini',tier:'default',validFrom:'2020-01-01',validUntil:'2100-01-01',inputNanoUsd:1000,cachedInputNanoUsd:100,outputNanoUsd:1000,webSearchNanoUsd:10000000,maxInputTokens:100000};
 const stage={tariff,maxInput:100000,maxOutput:1000,maxWebSearchCalls:2};
 const exchange={id:'synthetic',validFrom:'2020-01-01',validUntil:'2100-01-01',eurNumerator:9,usdDenominator:10};
 const privateStage={...stage,maxWebSearchCalls:0};
 const config={providerInputBoundsReviewed:true,economical:[stage,stage],advanced:[stage,{...stage,tariff:{...tariff,model:'gpt-6-astra'},maxWebSearchCalls:0}],document:[privateStage,privateStage],'assistant-research':[stage,stage],analysis:[privateStage,stage,privateStage],transcription:[{...privateStage,tariff:{...tariff,model:'gpt-4o-mini-transcribe',audioInputNanoUsd:5000}}],exchange};
 const api=load('../lib/commercial-meter.ts',{'server-only':{},'./reviewer-catalogue':{configuredReviewer:()=>{throw Error('MODEL_UNAVAILABLE');}},'./inference-cost':cost,'./live-subscription':{readLivePeriod:async()=>{calls.push('stripe-read');return new Date(Date.now()+86400000).toISOString();}}},{AI_COMMERCIAL_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_fixture',AI_COMMERCIAL_TARIFFS_JSON:JSON.stringify(config),...patch});
 let meter;
 const db={rpc:async(name,args)=>{calls.push(name);if(name==='ai_meter_wallets')return {data:[{id:'wallet',availableCents:1000,active:true,frozen:false}]};if(name==='ai_meter_reserve_v2')meter={id:args.p_id,actor_id:args.p_actor,plan:args.p_plan,exchange:args.p_exchange,created_at:new Date().toISOString(),state:'reserved'};return {data:name==='ai_meter_settle'?1:true};},from(table){let updating=false;const q={select(){return q;},eq(){return q;},update(){updating=true;return q;},async single(){return {data:table==='ai_meter_requests'?meter:updating?{id:'wallet'}:{live_customer:'cus_one',live_subscription:'sub_one',organization_id:null}};}};return q;}};
 return {api,db,calls};
}
test('commercial adapter checks Stripe then reserves, persists provider usage and settles',async()=>{
 const {api,db,calls}=setup();const meter=await api.reserveCommercialResearch(db,'actor','request',false,'wallet',100);
 assert.ok(calls.indexOf('stripe-read')<calls.indexOf('ai_meter_reserve_v2'));
 const body=api.meteredResearchBody(meter,0,{model:'untrusted',max_output_tokens:90000});assert.equal(body.max_output_tokens,1000);assert.equal(body.model,'gpt-5-mini');assert.equal(body.truncation,'disabled');
 const raw={id:'resp_one',model:'gpt-5-mini',service_tier:'default',status:'completed',usage:{input_tokens:100,input_tokens_details:{cached_tokens:0},output_tokens:100,output_tokens_details:{reasoning_tokens:10},total_tokens:200},output:[]};
 await api.recordCommercialResearch(db,'actor',meter,0,raw);assert.ok(calls.includes('ai_meter_record'));
 assert.equal(await api.settleCommercialResearch(db,'actor','request'),1);
 await assert.rejects(api.recordCommercialResearch(db,'actor',meter,0,{...raw,usage:null}),/METER_UNCONFIRMED/);
});
test('test keys, missing tariffs, missing approval and wallet mismatch cannot reserve',async()=>{
 const sandbox=setup({STRIPE_SECRET_KEY:'sk_test_fixture'});assert.equal(sandbox.api.commercialMeterEnabled(),false);
 await assert.rejects(sandbox.api.reserveCommercialResearch(sandbox.db,'actor','request',false,'wallet',100),/METER_SETUP/);assert.deepEqual(sandbox.calls,[]);
 const missing=setup({AI_COMMERCIAL_TARIFFS_JSON:''});await assert.rejects(missing.api.reserveCommercialResearch(missing.db,'actor','request',false,'wallet',100),/METER_SETUP/);
 const s=setup();await assert.rejects(s.api.reserveCommercialResearch(s.db,'actor','request',false,'wallet',0),/METER_QUOTE_CHANGED/);assert.deepEqual(s.calls,[]);
 await assert.rejects(s.api.reserveCommercialResearch(s.db,'actor','request',false,'somebody-else',100),/METER_FORBIDDEN/);assert.ok(!s.calls.includes('ai_meter_reserve_v2'));
});
test('each service reserves its complete plan; private stages cannot gain web tools',async()=>{
 for(const [service,length] of [['document',2],['assistant-research',2],['analysis',3],['transcription',1]]){
  const {api,db,calls}=setup();const meter=await api.reserveCommercialService(db,'actor','request',service,'wallet',500);
  assert.equal(meter.plan.length,length);assert.equal(calls.filter(c=>c==='ai_meter_reserve_v2').length,1);
  if(service!=='assistant-research')assert.throws(()=>api.meteredResearchBody(meter,0,{tools:[{type:'web_search'}]}),/METER_SETUP/);
  if(service==='transcription')await api.recordCommercialAudio(db,'actor',meter,{usage:{type:'tokens',input_tokens:10,input_token_details:{audio_tokens:9,text_tokens:1},output_tokens:1,total_tokens:11}},'req_test');
 }
});
