import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function fixture(){
 const state={reserved:0,calls:0,row:null,access:0,fail:false};
 const admin={from:()=>{let patch=null;const q={select:()=>q,eq:()=>q,update:v=>{patch=v;return q;},maybeSingle:async()=>({data:state.row,error:null}),single:async()=>{state.row={...state.row,...patch};return {data:state.row,error:null};},then:resolve=>{state.row={...state.row,...patch};resolve({error:null});}};return q;},rpc:async()=>{if(state.row)return {error:{message:'PILOT_DUPLICATE'}};state.reserved+=100;state.row={status:'reserved'};return {data:true};}};
 const deps={
 'server-only':{},
 './ai-pilot':{pilotAccount:u=>u?.id==='owner',pilotEnabled:()=>true,PILOT_EXPIRES:'2100-01-01'},
 './external-review':{countFailureMessage:()=>null,countExternalReview:async()=>123,checkExternalModel:async()=>{state.access++;},externalReview:async(model,instructions,prompt,schema,input,output)=>{state.calls++;assert.equal(model.model,'claude-sonnet-5');assert.equal(input,2000);assert.equal(output,600);assert.ok(prompt.includes('fictício'));if(state.fail)throw Error('timeout');return {status:'completed',model:model.model,id:'fixture',usage:{input_tokens:200,output_tokens:100},output:[{content:[{text:JSON.stringify({answer:'Documentos contraditórios [A] [B].'})}]}]};}}
 };
 const js=ts.transpileModule(readFileSync(new URL('../lib/claude-pilot.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports','process',js)(id=>{assert.ok(id in deps,id);return deps[id];},exports,{env:{ANTHROPIC_API_KEY:'fixture',AI_EXECUTION_ENABLED:'true'}});
 return {state,diagnose:exports.diagnoseClaudeCount,run:(user={id:'owner'},consent=true)=>exports.runClaudePilot(admin,user,consent)};
}
test('count-only diagnostic never reserves budget or generates text',async()=>{const f=fixture();assert.match(await f.diagnose(),/123 tokens/);assert.equal(f.state.reserved,0);assert.equal(f.state.calls,0);assert.equal(f.state.row,null);});
test('Claude pilot requires owner and explicit consent before access or generation',async()=>{
 const f=fixture();await assert.rejects(f.run({id:'other'}),/FORBIDDEN/);await assert.rejects(f.run({id:'owner'},false),/FORBIDDEN/);assert.equal(f.state.access,0);assert.equal(f.state.calls,0);
});
test('concurrent Claude tests reserve once and generate once; response is persisted',async()=>{
 const f=fixture();const values=await Promise.allSettled([f.run(),f.run()]);assert.equal(values.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.state.calls,1);assert.equal(f.state.reserved,100);assert.equal(f.state.row.status,'completed');assert.match(f.state.row.result.answer,/contraditórios/);await assert.rejects(f.run(),/DUPLICATE/);
});
test('failed Claude generation retains reservation and can never be retried',async()=>{
 const f=fixture();f.state.fail=true;await assert.rejects(f.run(),/UNCERTAIN/);assert.equal(f.state.row.status,'uncertain');await assert.rejects(f.run(),/DUPLICATE/);assert.equal(f.state.calls,1);assert.equal(f.state.reserved,100);
});
