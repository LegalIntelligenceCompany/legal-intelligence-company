import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {reportWord} from '../lib/word-review.ts';
function load(path,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText)(n=>{if(!(n in deps))throw Error(n);return deps[n];},m,m.exports);return m.exports;}
const safe={safeSourceUrl:s=>{try{const url=new URL(s);return url.protocol==='https:'?url.href:null;}catch{return null;}}};
const {citationEvidence,isCitationMarker,officialSource,attributedText}=load('../lib/citation-evidence.ts',{'./legal-research':safe});
test('export keeps citation numbers identical to the interface and preserves cited prose',()=>{
 const output=attributedText({text:'Texto citado e [9]',citations:[{start:0,end:12,url:'https://example.org/a',title:'A'},{start:15,end:18,url:'https://example.org/b',title:'B'}]});
 assert.ok(output.startsWith('Texto citado [1] e [2]'));assert.ok(output.includes('[1] A: https://example.org/a'));assert.ok(output.includes('[2] B: https://example.org/b'));
});
test('evidence never accepts unsafe URLs, invalid spans or overlapping citations',()=>{
 const r={text:'Afirmação [1]. Outra [2].',citations:[{start:10,end:13,url:'https://dgsi.pt/a',title:'A'},{start:10,end:15,url:'https://example.org',title:'overlap'},{start:20,end:23,url:'javascript:alert(1)',title:'bad'},{start:99,end:100,url:'https://example.org',title:'bounds'}]};
 const citations=citationEvidence(r);assert.equal(citations.length,1);assert.equal(citations[0].context,r.text);assert.equal(citations[0].official,true);assert.equal(citations[0].number,1);
 assert.equal(officialSource('https://dgsi.pt.attacker.example/x'),false);assert.equal(isCitationMarker('Uma afirmação verdadeira?'),false);assert.equal(isCitationMarker('[1]'),true);
});
test('repeated source uses a consistent number; associated context is not invented source text',()=>{
 const citations=citationEvidence({text:'A [1]\n\nB [1]',citations:[{start:2,end:5,url:'https://example.org/a',title:'A'},{start:9,end:12,url:'https://example.org/a',title:'A'}]});assert.deepEqual(citations.map(c=>c.number),[1,1]);assert.equal(citations[1].context,'B [1]');
});
const {filterEntries,linkedDocument,entryText}=load('../lib/library.ts',{'./legal-research':safe,'./clauses':{readClause:body=>({text:body})},'./case-workspace':load('../lib/case-workspace.ts')});
test('structured sources and documents remain searchable and export as human-readable text',()=>{
 const record={type:'lic-case-v1',kind:'source',text:'Texto original por conferir',date:'2026-01-01',until:'',reference:'Artigo fictício',url:'https://dgsi.pt/example',related:[],status:'pending',jurisdiction:'PT'};
 const body=JSON.stringify(record),entries=[{title:'Fonte',body,sources:[]},{title:'Documento',body:JSON.stringify({...record,kind:'document'}),sources:[]}];
 assert.equal(filterEntries(entries,'Artigo','sources').length,1);assert.equal(filterEntries(entries,'','documents').length,1);
 assert.match(entryText(body),/Referência: Artigo fictício/);assert.match(entryText(body),/Texto original por conferir/);assert.ok(!entryText(body).includes('lic-case-v1'));
});
test('dossier search folds accents and filters references, revisions and linked documents',()=>{
 const entries=[{title:'Cláusula',body:'Versão actual',sources:[{title:'Lei',reference:'Artigo 12',excerpt:'Renovação'}]},{title:'Contrato',body:JSON.stringify({type:'lic-document-link-v1',contractId:'10000000-0000-4000-8000-000000000001',filename:'A.pdf'}),sources:[]},{title:'Revisão',body:'Alterada',revision_of:'id',sources:[]}];
 assert.equal(filterEntries(entries,'clausula renovacao','sources').length,1);assert.equal(filterEntries(entries,'','documents').length,1);assert.equal(filterEntries(entries,'','revisions').length,1);assert.equal(linkedDocument('{"type":"lic-document-link-v1","contractId":"javascript:evil","filename":"x"}'),null);
});
test('Word report escapes untrusted markup and retains Portuguese text and source URLs',()=>{
 const bytes=reportWord('Revisão & fontes','<script>alert(1)</script>\nCláusula: https://dgsi.pt/a');const text=new TextDecoder().decode(bytes);assert.ok(text.includes('&lt;script&gt;'));assert.ok(!text.includes('<script>'));assert.ok(text.includes('Cláusula: https://dgsi.pt/a'));assert.ok(text.includes('word/styles.xml'));assert.throws(()=>reportWord('','x'));
});
const {followUpHistory}=load('../lib/research-context.ts');
test('follow-up context is bounded, contains last two pairs and preserves roles',()=>{
 const history=followUpHistory({question:'q'.repeat(4000),history:[{role:'user',content:'old'},{role:'assistant',content:'a'.repeat(12000)},{role:'user',content:'recent'},{role:'assistant',content:'b'.repeat(12000)}]},{text:'c'.repeat(60000)});assert.equal(history.length,4);assert.equal(history[0].content,'recent');assert.equal(history[3].content.length,9000);assert.ok(JSON.stringify(history).length<30000);
});
