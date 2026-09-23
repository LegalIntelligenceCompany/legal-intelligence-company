import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const out={};const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',js)(id=>{if(!(id in deps))throw Error(id);return deps[id];},out);return out;}
const cost=load('../lib/inference-cost.ts');
const {executeMeteredRequest}=load('../lib/inference-settlement.ts',{'./inference-cost':cost});
const at=Date.parse('2026-09-23T12:00:00Z');
function fixture(){
 const calls=[];
 const tariff={id:'synthetic',model:'fixture',tier:'default',validFrom:'2026-09-23',validUntil:'2026-09-24',inputNanoUsd:1000,cachedInputNanoUsd:100,outputNanoUsd:1000,webSearchNanoUsd:10000000,maxInputTokens:1000};
 const exchange={id:'synthetic',validFrom:'2026-09-23',validUntil:'2026-09-24',eurNumerator:9,usdDenominator:10};
 const ledger={environment:'test',reserve:async r=>calls.push(['reserve',r]),record:async r=>calls.push(['record',r]),settle:async r=>calls.push(['settle',r])};
 const options={id:'request',actorId:'actor',walletId:'wallet',stages:[{tariff,maxInput:1000,maxOutput:1000,maxWebSearchCalls:2}],exchange,ledger,providerEnvironment:'mock',now:()=>at,
 invoke:async()=>{calls.push(['invoke']);return {id:'resp_fixture',status:'completed',model:'fixture',service_tier:'default',usage:{input_tokens:100,input_tokens_details:{cached_tokens:0},output_tokens:100,output_tokens_details:{reasoning_tokens:50},total_tokens:200},output:[]};},format:responses=>responses.length};
 return {options,calls};
}
test('reserve, invoke, record, settle occur in order before result',async()=>{
 const {options,calls}=fixture();const result=await executeMeteredRequest(options);
 assert.deepEqual(calls.map(c=>c[0]),['reserve','invoke','record','settle']);
 assert.equal(calls[0][1].ceilingCents,6);assert.equal(result.cost.customerBaseCents,1);assert.equal(result.result,1);
});
test('fictitious credits cannot fund live calls',async()=>{
 const {options,calls}=fixture();options.providerEnvironment='live';
 await assert.rejects(executeMeteredRequest(options),/SANDBOX_CANNOT_FUND_INFERENCE/);assert.equal(calls.length,0);
});
test('insufficient or duplicate reservation never invokes provider',async()=>{
 for(const code of ['INSUFFICIENT_BALANCE','DUPLICATE_REQUEST']){
 const {options,calls}=fixture();options.ledger.reserve=async()=>{throw Error(code);};
 await assert.rejects(executeMeteredRequest(options),new RegExp(code));assert.equal(calls.length,0);
 }
});
test('timeout retains reservation, never retries or settles zero',async()=>{
 const {options,calls}=fixture();options.invoke=async()=>{calls.push(['invoke']);throw Error('TIMEOUT');};
 await assert.rejects(executeMeteredRequest(options),/TIMEOUT/);assert.deepEqual(calls.map(c=>c[0]),['reserve','invoke']);
});
test('unknown usage or unconfirmed persistence stops subsequent paid stages',async()=>{
 for(const failure of ['usage','record']){
 const {options,calls}=fixture();options.stages.push(structuredClone(options.stages[0]));
 if(failure==='usage')options.invoke=async()=>{calls.push(['invoke']);return {};};
 else options.ledger.record=async()=>{throw Error('PERSISTENCE');};
 await assert.rejects(executeMeteredRequest(options));assert.equal(calls.filter(c=>c[0]==='invoke').length,1);assert.ok(!calls.some(c=>c[0]==='settle'));
 }
});
test('new stage is not submitted after tariff expires',async()=>{
 const {options,calls}=fixture();options.stages.push(structuredClone(options.stages[0]));let count=0;
 options.now=()=>++count<=2?at:Date.parse('2026-09-24');
 await assert.rejects(executeMeteredRequest(options),/TARIFF_EXPIRED/);assert.equal(calls.filter(c=>c[0]==='invoke').length,1);
});
