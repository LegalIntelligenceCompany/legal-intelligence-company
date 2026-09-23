import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../lib/inference-cost.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const api={};new Function('exports',source)(api);
const at=Date.parse('2026-09-23T12:00:00Z');
// Synthetic rates, not a current OpenAI price list.
const tariff={id:'fixture-v1',model:'fixture-model',tier:'default',validFrom:'2026-09-23',validUntil:'2026-09-24',inputNanoUsd:250,cachedInputNanoUsd:25,outputNanoUsd:2000,webSearchNanoUsd:10_000_000,maxInputTokens:100000};
const fx={id:'fixture-fx',validFrom:'2026-09-23',validUntil:'2026-09-24',eurNumerator:9,usdDenominator:10};
function raw(patch={}){return {id:'resp_one',model:'fixture-model',service_tier:'default',status:'completed',usage:{input_tokens:1000,input_tokens_details:{cached_tokens:200},output_tokens:100,total_tokens:1100,output_tokens_details:{reasoning_tokens:80}},output:[{type:'message'},{type:'reasoning'},{type:'web_search_call',id:'ws_one',status:'completed'}],...patch};}
test('counts full output once, cache discount, and each completed search call',()=>{
 const usage=api.readResponseUsage(raw());assert.equal(usage.output,100);assert.equal(usage.webSearchCalls,1);
 assert.equal(api.responseCostNanoUsd(usage,tariff,at),10_405_000n);
 const quote=api.quoteMeteredRequest([{usage,tariff,startedAt:at}],fx,at);
 assert.equal(quote.customerBaseCents,4);assert.equal(quote.providerCostEuroMicros,9365);
 assert.equal(quote.taxIncluded,false);
});
test('terminal incomplete output can cost money; pending or missing usage is not zero cost',()=>{
 assert.equal(api.readResponseUsage(raw({status:'incomplete'})).output,100);
 for(const patch of [{status:'in_progress'},{usage:null},{service_tier:null},{output:[{type:'code_interpreter_call'}]},{output:[{type:'web_search_call',id:'ws_one',status:'failed'}]}])assert.throws(()=>api.readResponseUsage(raw(patch)),/USAGE_UNCONFIRMED/);
});
test('rejects contradictory, negative, fractional and unsupported token breakdowns',()=>{
 for(const patch of [{input_tokens:-1},{input_tokens:0.1},{total_tokens:1},{input_tokens_details:{cached_tokens:1001}},{output_tokens_details:{reasoning_tokens:101}},{input_tokens_details:{cached_tokens:200,audio_tokens:3}},{input_tokens_details:{cached_tokens:200,cache_write_tokens:1}}])assert.throws(()=>api.readResponseUsage(raw({usage:{...raw().usage,...patch}})),/USAGE_UNCONFIRMED/);
 const call={type:'web_search_call',id:'ws_one',status:'completed'};
 assert.throws(()=>api.readResponseUsage(raw({output:[call,call]})),/USAGE_UNCONFIRMED/);
});
test('exact snapshot model, tier, context and validity are enforced',()=>{
 const usage=api.readResponseUsage(raw());
 for(const patch of [{model:'new-alias'},{tier:'priority'}])assert.throws(()=>api.responseCostNanoUsd({...usage,...patch},tariff,at),/TARIFF_MISMATCH/);
 assert.throws(()=>api.responseCostNanoUsd({...usage,input:100001},tariff,at),/CONTEXT_PRICE_UNCONFIRMED/);
 assert.throws(()=>api.responseCostNanoUsd(usage,tariff,Date.parse(tariff.validUntil)),/TARIFF_EXPIRED/);
 assert.throws(()=>api.quoteMeteredRequest([{usage,tariff,startedAt:at}],{...fx,usdDenominator:0},at),/USAGE_UNCONFIRMED/);
});
test('sums stages before rounding and refuses duplicate receipts',()=>{
 const usage={...api.readResponseUsage(raw()),input:1,cachedInput:0,output:0,webSearchCalls:0};
 const receipt={usage,tariff,startedAt:at};
 const other={...receipt,usage:{...usage,responseId:'resp_two'}};
 assert.equal(api.quoteMeteredRequest([receipt,other],fx,at).customerBaseCents,1);
 assert.throws(()=>api.quoteMeteredRequest([receipt,receipt],fx,at),/DUPLICATE_RECEIPT/);
 assert.throws(()=>api.quoteMeteredRequest([],fx,at),/USAGE_UNCONFIRMED/);
});
test('worst-case reservation ignores cache discounts and covers all stages',()=>{
 const stages=[{tariff,maxInput:100000,maxOutput:12000,maxWebSearchCalls:2},{tariff,maxInput:100000,maxOutput:12000,maxWebSearchCalls:2}];
 assert.equal(api.quoteReservation(stages,fx,at).customerBaseCents,44);
 assert.throws(()=>api.quoteReservation([{...stages[0],maxInput:100001}],fx,at),/CONTEXT_PRICE_UNCONFIRMED/);
});
test('audio receipts price audio separately and reserve at the higher input rate',()=>{
 const raw={usage:{type:'tokens',input_tokens:100,input_token_details:{audio_tokens:90,text_tokens:10},output_tokens:20,total_tokens:120}};
 const usage=api.readTranscriptionUsage(raw,'req_audio','fixture-model');
 const audioTariff={...tariff,audioInputNanoUsd:5000};
 assert.equal(api.responseCostNanoUsd(usage,audioTariff,at),492500n);
 assert.throws(()=>api.responseCostNanoUsd(usage,tariff,at),/USAGE_UNCONFIRMED/);
 const quote=api.quoteReservation([{tariff:audioTariff,maxInput:100000,maxOutput:100,maxWebSearchCalls:0}],fx,at);
 assert.equal(quote.customerBaseCents,158);
 assert.throws(()=>api.readTranscriptionUsage(raw,'invented','fixture-model'),/USAGE_UNCONFIRMED/);
 assert.throws(()=>api.readTranscriptionUsage({usage:{...raw.usage,input_tokens:101}},'req_audio','fixture-model'),/USAGE_UNCONFIRMED/);
 assert.throws(()=>api.readTranscriptionUsage({usage:{...raw.usage,type:'duration'}},'req_audio','fixture-model'),/USAGE_UNCONFIRMED/);
});
