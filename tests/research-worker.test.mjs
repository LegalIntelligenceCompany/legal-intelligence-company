import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function fixture(overrides={}){
 let calls=0;const row={owner_id:'stored-owner',state:'draft',model:'gpt-6-astra',expires_at:new Date(Date.now()+60000).toISOString(),...overrides.row};
 const user={id:'stored-owner',email_confirmed_at:new Date().toISOString(),...overrides.user};
 const admin={from(){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:row,error:overrides.error})};return q;},auth:{admin:{getUserById:async id=>{assert.equal(id,'stored-owner');return {data:{user}};}}}};
 const deps={'./supabase/admin':{createAdminClient:()=>admin},'./research-execution':{executeResearch:async(body,context)=>{calls++;assert.deepEqual(body,{action:'advance',id:'job'});assert.equal(context.user,user);assert.equal(context.admin,admin);return Response.json({job:{state:'review'}},{status:overrides.status||200});}}};
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../lib/research-worker.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>deps[n],m,m.exports);
 return {run:()=>m.exports.advanceStoredResearch('job'),calls:()=>calls};
}
test('worker resolves stored owner and only advances a previously authorized job',async()=>{const f=fixture();assert.equal((await f.run()).needsSettlement,false);assert.equal(f.calls(),1);const external=fixture({row:{model:'review-claude'}});assert.equal((await external.run()).needsSettlement,true);});
test('worker does not generate for expired, completed, banned or unverified owners',async()=>{for(const state of ['completed','failed']){const f=fixture({row:{state}});assert.deepEqual(await f.run(),{terminal:true});assert.equal(f.calls(),0);}const expired=fixture({row:{expires_at:'2000-01-01'}});assert.equal((await expired.run()).terminal,true);assert.equal(expired.calls(),0);for(const user of [{email_confirmed_at:null},{banned_until:new Date(Date.now()+60000).toISOString()}]){const f=fixture({user});await assert.rejects(f.run(),/FORBIDDEN/);assert.equal(f.calls(),0);}});
test('worker transport or database errors request redelivery without restarting generation',async()=>{await assert.rejects(fixture({error:{message:'offline'}}).run(),/SETUP/);await assert.rejects(fixture({status:503}).run(),/WORKER_RETRY/);});
