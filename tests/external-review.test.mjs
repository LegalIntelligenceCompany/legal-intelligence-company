import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={},env={}){const out={};const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports','process',js)(id=>{if(!(id in deps))throw Error(id);return deps[id];},out,{env});return out;}
const catalogue=load('../lib/reviewer-catalogue.ts');
test('owner access check authenticates, rejects unknown models and never exposes provider errors',async()=>{
 let calls=0;let user={email:'owner@example.test',email_confirmed_at:'today'};let fail=false;
 const deps={
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},
  '@/lib/billing':{isBillingTester:(email,expected)=>email===expected},
  '@/lib/reviewer-catalogue':{reviewerCatalogue:()=>[{id:'review-sonnet',provider:'anthropic'}],reviewerKey:()=> 'ANTHROPIC_API_KEY'},
  '@/lib/external-review':{checkExternalModel:async()=>{calls++;if(fail)throw Error('secret-provider-detail');}}
 };
 const action=load('../app/setup/models/actions.ts',deps,{BILLING_TEST_EMAIL:'owner@example.test',ANTHROPIC_API_KEY:'synthetic'});
 assert.match(await action.verifyModelAccess('review-sonnet'),/Acesso confirmado/);assert.equal(calls,1);
 assert.match(await action.verifyModelAccess('unknown'),/não configurados/);assert.equal(calls,1);
 user=null;assert.match(await action.verifyModelAccess('review-sonnet'),/reservada/);assert.equal(calls,1);
 user={email:'other@example.test',email_confirmed_at:'today'};await action.verifyModelAccess('review-sonnet');assert.equal(calls,1);
 user={email:'owner@example.test',email_confirmed_at:'today'};fail=true;
 const result=await action.verifyModelAccess('review-sonnet');assert.match(result,/Não foi possível/);assert.ok(!result.includes('secret-provider-detail'));
});
const api=load('../lib/external-review.ts',{'server-only':{},'./reviewer-catalogue':catalogue},{ANTHROPIC_API_KEY:'synthetic',GEMINI_API_KEY:'synthetic'});
test('count-only diagnostic uses only count endpoint and never discloses raw provider messages',async()=>{
 const previous=globalThis.fetch;let calls=0;
 try{
  for(const [status,body,expected] of [
   [400,{error:{type:'invalid_request_error',message:'Your credit balance is too low. SECRET'}},/saldo insuficiente/],
   [400,{error:{message:'SECRET'}},/formato ou os parâmetros/],
   [401,{error:{message:'SECRET'}},/autenticação/],
   [403,{},/recusou acesso/],[404,{},/não encontrou/],[429,{},/limite de pedidos/],[500,{},/indisponível/],
   [200,{input_tokens:'SECRET'},/resposta inválida/],[200,{input_tokens:2001},/limite de entrada/]
  ]){
   calls=0;globalThis.fetch=async(url)=>{calls++;assert.equal(url,'https://api.anthropic.com/v1/messages/count_tokens');return Response.json(body,{status});};
   await assert.rejects(api.countExternalReview({provider:'anthropic',model:'claude-fixture'},'system','prompt',{},2000),error=>{const message=api.countFailureMessage(error);assert.match(message,expected);assert.ok(!message.includes('SECRET'));assert.match(message,/Não foi enviado um pedido de geração/);return true;});assert.equal(calls,1);
  }
  globalThis.fetch=async()=>{throw new DOMException('SECRET','TimeoutError');};
  await assert.rejects(api.countExternalReview({provider:'anthropic',model:'claude-fixture'},'s','p',{},2000),error=>/tempo de espera/.test(api.countFailureMessage(error)));
  globalThis.fetch=async()=>Response.json({input_tokens:150});
  assert.equal(await api.countExternalReview({provider:'anthropic',model:'claude-fixture'},'s','p',{},2000),150);
  assert.equal(api.countFailureMessage(Error('SECRET')),null);
 }finally{globalThis.fetch=previous;}
});
const claude={id:'msg_fixture',model:'claude-fixture',stop_reason:'end_turn',content:[{type:'text',text:'{"blocks":[]}'}],usage:{input_tokens:100,cache_read_input_tokens:20,cache_creation_input_tokens:0,output_tokens:30,service_tier:'standard'}};
const gemini={responseId:'fixture',modelVersion:'gemini-fixture',candidates:[{finishReason:'STOP',content:{parts:[{text:'private reasoning',thought:true},{text:'{"blocks":[]}'}]}}],usageMetadata:{promptTokenCount:100,cachedContentTokenCount:20,candidatesTokenCount:30,thoughtsTokenCount:40,totalTokenCount:170}};
test('catalogue is opt-in, bounded and rejects URLs, duplicate IDs and unknown providers',()=>{
 assert.ok(catalogue.reviewerCatalogue({}).every(m=>!m.validated));
 for(const row of [{...catalogue.suggestedReviewers[0],model:'https://evil.example'},{...catalogue.suggestedReviewers[0],provider:'unknown'}])assert.throws(()=>catalogue.reviewerCatalogue({AI_REVIEW_MODELS_JSON:JSON.stringify([row])}));
 assert.throws(()=>catalogue.reviewerCatalogue({AI_REVIEW_MODELS_JSON:JSON.stringify([catalogue.suggestedReviewers[0],catalogue.suggestedReviewers[0]])}));
 assert.throws(()=>catalogue.configuredReviewer('review-sonnet'),/MODEL_UNAVAILABLE/);
});
test('Claude counts cache reads once and never adds thinking twice',()=>{
 const value=api.normaliseExternalReview('anthropic','claude-fixture',claude);
 assert.equal(value.usage.input_tokens,120);assert.equal(value.usage.total_tokens,150);assert.equal(value.usage.output_tokens,30);
 for(const patch of [{cache_creation_input_tokens:1},{server_tool_use:{web_search_requests:1}},{service_tier:'priority'},{inference_geo:'us'}])assert.throws(()=>api.normaliseExternalReview('anthropic','claude-fixture',{...claude,usage:{...claude.usage,...patch}}));
 assert.throws(()=>api.normaliseExternalReview('anthropic','claude-other',claude));
 assert.equal(api.normaliseExternalReview('anthropic','claude-fixture',{...claude,stop_reason:'max_tokens'}).status,'incomplete');
});
test('Gemini bills thoughts once, hides thoughts and rejects tools or mismatched totals/model',()=>{
 const value=api.normaliseExternalReview('google','gemini-fixture',gemini);
 assert.equal(value.usage.output_tokens,70);assert.equal(value.usage.total_tokens,170);assert.equal(value.output[0].content[0].text,'{"blocks":[]}');
 for(const patch of [{totalTokenCount:169},{toolUsePromptTokenCount:1},{promptTokensDetails:[{modality:'AUDIO'}]}])assert.throws(()=>api.normaliseExternalReview('google','gemini-fixture',{...gemini,usageMetadata:{...gemini.usageMetadata,...patch}}));
 assert.throws(()=>api.normaliseExternalReview('google','gemini-other',gemini));
});
test('token limit blocks generation; timeout is not retried; secrets stay in headers on fixed hosts',async()=>{
 const previous=globalThis.fetch,reviewer={provider:'anthropic',model:'claude-fixture'};let calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({input_tokens:1001});};
  await assert.rejects(api.externalReview(reviewer,'system','prompt',{},1000,100),/METER_CEILING/);assert.equal(calls.length,1);
  calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});if(calls.length===1)return Response.json({input_tokens:100});throw Error('timeout');};
  await assert.rejects(api.externalReview(reviewer,'system','prompt',{},1000,100),/timeout/);assert.equal(calls.length,2);
  assert.equal(calls[1].url,'https://api.anthropic.com/v1/messages');assert.equal(calls[1].options.redirect,'error');
  const body=JSON.parse(calls[1].options.body);assert.equal(body.max_tokens,100);assert.equal(body.service_tier,'standard_only');assert.equal(body.tools,undefined);assert.equal(body.cache_control,undefined);
 }finally{globalThis.fetch=previous;}
});
test('both adapters use provider counts and return normalised completed text',async()=>{
 const previous=globalThis.fetch;
 try{for(const [provider,raw] of [['anthropic',claude],['google',gemini]]){
  let calls=0;globalThis.fetch=async()=>Response.json(++calls===1?(provider==='anthropic'?{input_tokens:100}:{totalTokens:100}):raw);
  const value=await api.externalReview({provider,model:raw.model||raw.modelVersion},'system','prompt',{},1000,100);
  assert.equal(value.status,'completed');assert.equal(calls,2);
 }}finally{globalThis.fetch=previous;}
});
test('commercial reviewer plan binds exact model, two stages, valid tariff and key',()=>{
 const cost=load('../lib/inference-cost.ts');
 const entry={id:'review-sonnet',label:'Sonnet',provider:'anthropic',model:'claude-fixture',validated:true};
 const tariff={id:'fixture',model:'gpt-5-mini',tier:'default',validFrom:'2020-01-01',validUntil:'2100-01-01',inputNanoUsd:1000,cachedInputNanoUsd:100,outputNanoUsd:1000,webSearchNanoUsd:10000000,maxInputTokens:1000};
 const stage={tariff,maxInput:1000,maxOutput:100,maxWebSearchCalls:2};
 const config={providerInputBoundsReviewed:true,exchange:{id:'fixture',validFrom:'2020-01-01',validUntil:'2100-01-01',eurNumerator:1,usdDenominator:1},'review-sonnet':[stage,{...stage,tariff:{...tariff,model:entry.model},maxWebSearchCalls:0}]};
 const make=(changes={},value=config)=>{const env={ANTHROPIC_API_KEY:'fixture',AI_REVIEW_MODELS_JSON:JSON.stringify([entry]),AI_COMMERCIAL_TARIFFS_JSON:JSON.stringify(value),...changes};return load('../lib/commercial-meter.ts',{'server-only':{},'./inference-cost':cost,'./live-subscription':{},'./reviewer-catalogue':load('../lib/reviewer-catalogue.ts',{},env)},env);};
 assert.ok(make().meterConfiguration('review-sonnet').ceiling>0);
 assert.throws(()=>make({ANTHROPIC_API_KEY:''}).meterConfiguration('review-sonnet'),/METER_SETUP/);
 assert.throws(()=>make({}, {...config,providerInputBoundsReviewed:false}).meterConfiguration('review-sonnet'),/METER_SETUP/);
 assert.throws(()=>make({}, {...config,'review-sonnet':[stage,stage]}).meterConfiguration('review-sonnet'),/METER_SETUP/);
});
