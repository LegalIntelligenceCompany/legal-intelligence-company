import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPublished,origin,probes} from '../scripts/check-published.mjs';

test('public monitoring never sends credentials, paid requests or follows redirects',async()=>{
 let active=0,max=0;
 const results=await checkPublished({fetcher:async(url,options)=>{
  active++;max=Math.max(max,active);await new Promise(resolve=>setImmediate(resolve));
  const probe=probes.find(p=>origin+p.path===url);assert.ok(probe);
  assert.ok(['GET','HEAD'].includes(options.method));assert.equal(options.redirect,'manual');
  assert.equal(options.body,undefined);assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);
  active--;
  return new Response(null,{status:probe.status,headers:{'content-type':'text/html','x-content-type-options':'nosniff','x-frame-options':'DENY'}});
 }});
 assert.equal(results.length,probes.length);assert.ok(results.every(r=>r.ok));assert.equal(max,2);
});
test('monitor fails on open protected endpoint, missing asset, redirect, timeout or missing security headers',async()=>{
 for(const status of [200,302,404,503]){
  const results=await checkPublished({fetcher:async()=>new Response(null,{status})});
  assert.ok(results.some(r=>!r.ok));
  assert.equal(results.find(r=>r.path==='/login').ok,false);
 }
 const failed=await checkPublished({fetcher:async()=>{throw Error('do not leak sensitive transport error');}});
 assert.ok(failed.every(r=>!r.ok));assert.ok(!JSON.stringify(failed).includes('sensitive transport'));
});
