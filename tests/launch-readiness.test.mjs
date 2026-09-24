import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loginDestination} from '../lib/login-destination.ts';
function load(file,deps={},env={}){const out={};const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports','process',js)(id=>{if(!(id in deps))throw Error(id);return deps[id];},out,{env});return out;}
test('login destination rejects external, encoded, admin and protocol-relative targets',()=>{
 for(const value of ['https://evil.example','//evil.example','/%2f/evil.example','/setup/launch','/chat?next=https://evil.example',null,undefined])assert.equal(loginDestination(value),'/dashboard');
 for(const value of ['/usage','/credits','/settings','/chat'])assert.equal(loginDestination(value),value);
});
test('setup authorization fails closed and requires confirmed configured owner',async()=>{
 for(const [user,env,error,expected] of [
  [{email:'owner@example.test',email_confirmed_at:'now'},{BILLING_TEST_EMAIL:'OWNER@example.test'},null,true],
  [{email:'client@example.test',email_confirmed_at:'now'},{BILLING_TEST_EMAIL:'owner@example.test'},null,false],
  [{email:'owner@example.test'},{BILLING_TEST_EMAIL:'owner@example.test'},null,false],
  [{email:'owner@example.test',email_confirmed_at:'now'},{},null,false],
  [null,{BILLING_TEST_EMAIL:'owner@example.test'},Error('offline'),false],
 ]){const m=load('../lib/site-owner.ts',{'server-only':{},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user},error})}})}},env);assert.equal(await m.isSiteOwner(),expected);}
 const m=load('../lib/site-owner.ts',{'server-only':{},'@/lib/supabase/server':{createClient:async()=>{throw Error('offline');}}});assert.equal(await m.isSiteOwner(),false);
});
function creditsRoute({denied=false}={}){
 const calls=[];const origin='https://legal-intelligence-company.vercel.app';
 const api=load('../app/api/live-credits/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'actor',email_confirmed_at:'now'}}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>({})},
  '@/lib/live-credits':{liveCreditOrigin:origin,liveCreditConfig:()=>{calls.push('sales-config');throw Error('LIVE_DISABLED');},ownedLiveWallet:async()=>{calls.push('authorize');if(denied)throw Error('METER_FORBIDDEN');},livePortal:async()=>{calls.push('portal');return 'https://billing.stripe.com/session/test';}},
 });
 return {calls,post:body=>api.POST(new Request(origin+'/api/live-credits',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}))};
}
test('pausing purchases does not prevent authenticated owner cancellation',async()=>{
 const s=creditsRoute();const r=await s.post({action:'portal',walletId:'10000000-0000-4000-8000-000000000001'});assert.equal(r.status,200);assert.deepEqual(s.calls,['authorize','portal']);
});
test('paused checkout still fails closed and portal rejects other owners',async()=>{
 const s=creditsRoute();assert.equal((await s.post({action:'checkout',walletId:'10000000-0000-4000-8000-000000000001'})).status,503);assert.deepEqual(s.calls,['sales-config']);
 const denied=creditsRoute({denied:true});assert.equal((await denied.post({action:'portal',walletId:'10000000-0000-4000-8000-000000000001'})).status,403);assert.deepEqual(denied.calls,['authorize']);
});
test('unsaved work warns without storing content and removes listeners on cleanup',()=>{
 const listeners=new Map();let cleanup,confirmed=0;
 const source=ts.transpileModule(readFileSync(new URL('../components/use-unsaved-work.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const target={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 class ElementStub{closest(){return {target:'',hasAttribute:()=>false,getAttribute:()=>'/settings',href:'http://localhost/settings'};}}
 const out={};new Function('require','exports','window','document','Element',source)(()=>({useEffect:fn=>{cleanup=fn();}}),out,{...target,location:{href:'http://localhost/tools',pathname:'/tools',search:''},confirm:()=>{confirmed++;return false;}},target,ElementStub);
 out.useUnsavedWork(false);assert.equal(listeners.size,0);
 out.useUnsavedWork(true);assert.equal(listeners.size,2);
 let prevented=0,stopped=0;const event={button:0,target:new ElementStub(),preventDefault:()=>prevented++,stopPropagation:()=>stopped++};listeners.get('click')(event);assert.equal(confirmed,1);assert.equal(prevented,1);assert.equal(stopped,1);
 listeners.get('beforeunload')(event);assert.equal(event.returnValue,'');cleanup();assert.equal(listeners.size,0);
});
