import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,deps={}){const out={};const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',js)(id=>{if(!(id in deps))throw Error(id);return deps[id];},out);return out;}
const api=load('../lib/tariff-preparation.ts');
const now=Date.parse('2026-09-23T12:00:00Z');
const xml=(date='2026-09-23',rate='1.1411')=>`<Envelope><Cube><Cube time="${date}"><Cube currency="USD" rate="${rate}"/><Cube currency="GBP" rate="0.8"/></Cube></Cube></Envelope>`;
test('ECB reference is inverted exactly, with source date, without assuming parity',()=>{
 const fx=api.parseReferenceExchange(xml(),now);
 assert.deepEqual(fx,{date:'2026-09-23',usdPerEuro:'1.1411',eurNumerator:10000,usdDenominator:11411});
 assert.equal(api.simulateProviderCost('0,10',fx).customerCents,31);
 assert.equal(api.simulateProviderCost('0',fx).customerCents,0);
 assert.equal(api.simulateProviderCost('0.000001',fx).customerCents,1);
});
test('stale/future/invalid or ambiguous FX is rejected without a fallback',()=>{
 for(const document of [xml('2026-09-01'),xml('2026-09-24'),xml('2026-02-30'),xml('2026-09-23','0'),xml()+xml(),xml().replace('currency="USD"','currency="EUR"'),xml().replace('</Cube>','<Cube currency="USD" rate="1.2"/></Cube>'),'<!DOCTYPE fake>'+xml(),'x'.repeat(100001)])assert.throws(()=>api.parseReferenceExchange(document,now));
 assert.throws(()=>api.parseReferenceExchange(xml(),NaN));
});
test('simulation cannot accept negative, malformed or non-finite amounts',()=>{
 const fx=api.parseReferenceExchange(xml(),now);
 for(const value of ['-1','NaN','Infinity','1e3','','0.1234567','1000000','1,2,3'])assert.throws(()=>api.simulateProviderCost(value,fx));
 assert.throws(()=>api.simulateProviderCost('1',{...fx,usdDenominator:0}));
});
test('simulation rounds only the aggregate final debit',()=>{
 const fx={date:'2026-09-23',usdPerEuro:'2',eurNumerator:1,usdDenominator:2};
 assert.equal(api.simulateProviderCost('0.01',fx).customerCents,2);
 assert.equal(api.simulateProviderCost('1',fx).customerCents,175);
});
test('reference fetch failure and stale data return null; fresh data is accepted',async()=>{
 const original=globalThis.fetch;
 try{
  const {referenceExchange}=load('../lib/reference-exchange.ts',{'server-only':{},'./tariff-preparation':api});
  globalThis.fetch=async()=>{throw Error('offline');};assert.equal(await referenceExchange(),null);
  globalThis.fetch=async()=>new Response(xml('2020-01-01'));assert.equal(await referenceExchange(),null);
  globalThis.fetch=async()=>new Response('x'.repeat(100001));assert.equal(await referenceExchange(),null);
  globalThis.fetch=async(url,options)=>{assert.equal(url,api.ecbSource);assert.equal(options.redirect,'error');return new Response(xml(new Date().toISOString().slice(0,10)));};
  assert.equal((await referenceExchange()).usdPerEuro,'1.1411');
 }finally{globalThis.fetch=original;}
});
