import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
function load(file,deps){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../lib/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText)(n=>{if(!(n in deps))throw Error(n);return deps[n];},m,m.exports);return m.exports;}
const source=load('source-fetch.ts',{'linkedom':await import('linkedom'),'node:crypto':await import('node:crypto')});
const {collectOriginals}=load('research-originals.ts',{'./source-fetch':source});
const {advancedReviewBody,advancedReviewResult}=load('research-models.ts',{'./assistant':{parseAssistantResponse:r=>({text:r.text})}});
test('original recovery is bounded, official-only, stable IDs and missing sources do not fabricate evidence',async()=>{
 const citations=['https://example.org/','https://dgsi.pt/a','https://dgsi.pt/a','https://diariodarepublica.pt/b','https://eur-lex.europa.eu/c','https://curia.europa.eu/d'].map(url=>({url,title:url}));const called=[];
 const originals=await collectOriginals({citations},async url=>{called.push(url);if(url.endsWith('/b'))throw Error('blocked');return {text:'Texto público. '.repeat(1000),retrievedAt:'2026-09-26',sha256:'hash',truncated:false};});
 assert.equal(called.length,3);assert.deepEqual(originals.map(o=>o.sourceId),[2,4]);assert.ok(originals.every(o=>o.text.length<=4000&&o.truncated));assert.ok(!called.some(url=>url.includes('example.org')));
});
test('review checks exact excerpt, downgrades fabricated quotes and never labels AI assessment certification',()=>{
 const url='https://dgsi.pt/a';const draft={text:'Rascunho',citations:[{url,title:'Original'}],originals:[{sourceId:1,url,text:'O prazo depende da notificação. Há excepções que devem ser verificadas.'}]};
 const body=advancedReviewBody({question:'Qual é o prazo?',country:'Portugal',profile:'Geral'},draft);assert.ok(body.input[0].content.includes('untrustedOriginalExcerpts'));assert.equal(body.tools,undefined);
 const raw=quote=>({text:JSON.stringify({blocks:[{heading:'Prazo',text:'Depende do caso.',sourceIds:[1],evidence:[{sourceId:1,quote,assessment:'supports'}]}]})});
 const exact=advancedReviewResult(raw('O prazo depende da notificação.'),draft);assert.equal(exact.evidence[0].literalMatch,true);assert.equal(exact.evidence[0].assessment,'supports');
 for(const quote of ['O prazo é sempre dez dias.','o prazo depende da notificação.','']){const output=advancedReviewResult(raw(quote),draft);assert.equal(output.evidence[0].literalMatch,false);assert.equal(output.evidence[0].assessment,'insufficient');}
 const without=advancedReviewResult(raw('O prazo depende da notificação.'),{...draft,originals:[]});assert.equal(without.evidence[0].assessment,'insufficient');
 assert.throws(()=>advancedReviewResult({text:JSON.stringify({blocks:[{heading:'A',text:'B',sourceIds:[1],evidence:[{sourceId:2,quote:'Inventado',assessment:'supports'}]}]})},draft));
});
