import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as research from '../lib/legal-research.ts';
function load(path,deps={}){const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText;const m={exports:{}};new Function('require','module','exports',source)(n=>{if(!(n in deps))throw Error(n);return deps[n];},m,m.exports);return m.exports;}
const services=load('../lib/services.ts');
const assistant=load('../lib/assistant.ts',{'./services':services,'./legal-research':research,'./citation-evidence':load('../lib/citation-evidence.ts',{'./legal-research':research})});
const library=load('../lib/library.ts',{'./legal-research':research,'./clauses':load('../lib/clauses.ts')});
const id='11111111-1111-4111-8111-111111111111';
test('source evidence survives validation and export without automatic approval',()=>{
 const source={title:'Fonte de teste',url:'https://diariodarepublica.pt/',excerpt:'Excerto fictício',reference:'Artigo fictício',version:'Vigência não confirmada',consulted:'2026-09-25',reviewed:true};
 assert.deepEqual(library.librarySources([source]),[source]);
 assert.equal(library.librarySources([{title:source.title,url:source.url}])[0].reviewed,undefined);
 for(const patch of [{consulted:'2026-02-30'},{reviewed:'true'},{excerpt:''},{excerpt:'a'.repeat(4001)}])assert.throws(()=>library.librarySources([{...source,...patch}]));
 assert.throws(()=>library.librarySources(Array(100).fill(source).map(s=>({...s,excerpt:'a'.repeat(1000)}))));
 assert.match(library.exportDossier({title:'Teste',description:'',kind:'dossier'},[{title:'Nota',created_at:'2026-09-25',body:'Teste',sources:[source]}]),/Excerto fictício/);
});
const base={requestId:id,mode:'research',profile:'Geral',country:'Portugal',question:'Teste',history:[],documentIds:[],consent:true};
test('collection services require one to five unique scoped PDFs and matching workflow',()=>{
 for(const workflow of ['evidence','dossier-search']){
  const input={...base,mode:'collection',workflow,format:services.workflows[workflow].formats[0],organizationId:id,documentIds:[id]};
  assert.equal(assistant.validateAssistantInput(input).mode,'collection');
  for(const patch of [{mode:'research',documentIds:[]},{organizationId:undefined},{documentIds:[]},{documentIds:[id,id]},{workflow:undefined,format:undefined},{documentIds:Array.from({length:6},(_,i)=>`${i}1111111-1111-4111-8111-111111111111`)}])assert.throws(()=>assistant.validateAssistantInput({...input,...patch}));
 }
});
test('meeting material is private, bounded, required and forbidden in public research',()=>{
 const input={...base,workflow:'meeting',format:'Proposta de acta',mode:'private-text',material:'Notas: foi proposta uma reunião. Não houve decisão.'};
 assert.equal(assistant.validateAssistantInput(input).material,input.material);
 for(const patch of [{material:''},{material:'x'.repeat(60001)},{mode:'research'},{documentIds:[id]},{workflow:undefined,format:undefined}])assert.throws(()=>assistant.validateAssistantInput({...input,...patch}));
 assert.throws(()=>assistant.validateAssistantInput({...base,material:'privado'}));
 assert.match(assistant.assistantInstructions(input),/proposta não é decisão/);
});
test('negotiation is document-only and does not certify validity',()=>{
 const input={...base,workflow:'negotiation',format:'Plano de negociação',mode:'document',organizationId:id,documentIds:[id]};
 assert.equal(assistant.validateAssistantInput(input).mode,'document');
 assert.throws(()=>assistant.validateAssistantInput({...input,mode:'research',documentIds:[]}));
 assert.match(assistant.assistantInstructions(input),/não cláusula válida/);
});
test('explainer requires one owned-context PDF and preserves evidence limits',()=>{for(const format of services.workflows.explainer.formats){const input={...base,workflow:'explainer',format,mode:'document',organizationId:id,documentIds:[id]};assert.equal(assistant.validateAssistantInput(input).mode,'document');const prompt=assistant.assistantInstructions(input);assert.match(prompt,/texto original, explicação e exemplo hipotético/);assert.match(prompt,/Não certifiques validade/);assert.throws(()=>assistant.validateAssistantInput({...input,mode:'research',documentIds:[]}));assert.throws(()=>assistant.validateAssistantInput({...input,documentIds:[]}));assert.throws(()=>assistant.validateAssistantInput({...input,organizationId:undefined}));}});
test('reviewer supports public research or private PDF, not comparison or obligations',()=>{for(const format of services.workflows.reviewer.formats){const publicInput={...base,workflow:'reviewer',format};assert.equal(assistant.validateAssistantInput(publicInput).mode,'research');const privateInput={...publicInput,mode:'document',organizationId:id,documentIds:[id]};assert.equal(assistant.validateAssistantInput(privateInput).mode,'document');assert.match(assistant.assistantInstructions(privateInput),/permanece não verificada/);assert.match(assistant.assistantInstructions(publicInput),/probabilidades de vitória/);assert.throws(()=>assistant.validateAssistantInput({...privateInput,mode:'obligations'}));assert.throws(()=>assistant.validateAssistantInput({...publicInput,documentIds:[id]}));}});
test('all specialised public workflows have validated formats and specific instructions',()=>{for(const [workflow,w] of Object.entries(services.workflows)){if(['timeline','explainer','evidence','dossier-search','meeting','negotiation'].includes(workflow))continue;for(const format of w.formats){const input=assistant.validateAssistantInput({...base,workflow,format});assert.ok(assistant.assistantInstructions(input).includes(w.title));}assert.throws(()=>assistant.validateAssistantInput({...base,workflow,format:'inventado'}));}assert.equal(services.isWorkflow('__proto__'),false);});
test('timeline accepts one to five scoped unique PDFs, never public research',()=>{const input={...base,mode:'timeline',workflow:'timeline',format:'Cronologia com evidência',organizationId:id,documentIds:[id]};assert.equal(assistant.validateAssistantInput(input).mode,'timeline');assert.throws(()=>assistant.validateAssistantInput({...input,documentIds:[]}));assert.throws(()=>assistant.validateAssistantInput({...input,documentIds:[id,id]}));assert.throws(()=>assistant.validateAssistantInput({...input,organizationId:undefined}));assert.throws(()=>assistant.validateAssistantInput({...input,mode:'research'}));assert.match(assistant.assistantInstructions(input),/exclusivamente nos ficheiros/);});
test('library validates content and rejects unsafe links; differences are textual',()=>{assert.throws(()=>library.librarySources([{title:'x',url:'javascript:alert(1)'}]));assert.throws(()=>library.librarySources([{title:'x',url:'http://localhost/x'}]));assert.throws(()=>library.libraryText(' ',160));assert.throws(()=>library.libraryText('x'.repeat(161),160));assert.deepEqual(library.compareReports('A\nB','B\nC'),{removed:['A'],added:['C']});assert.equal(library.librarySources([{title:'DR',url:'https://diariodarepublica.pt/'}]).length,1);});
