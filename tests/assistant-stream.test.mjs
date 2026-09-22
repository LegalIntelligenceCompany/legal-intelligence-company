import test from 'node:test';
import assert from 'node:assert/strict';
import {readAssistantResponse} from '../lib/assistant-stream.ts';
function response(text,step=1){const bytes=new TextEncoder().encode(text);return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=step)c.enqueue(bytes.slice(i,i+step));c.close();}}),{headers:{'content-type':'application/x-ndjson'}});}
test('stream decoder handles fragmented UTF8, heartbeats and final result',async()=>{
 const stages=[];const result=await readAssistantResponse(response(JSON.stringify({type:'progress',stage:'review'})+'\n'+JSON.stringify({type:'heartbeat'})+'\n'+JSON.stringify({type:'done',status:200,data:{result:{text:'Revisão jurídica'}}})+'\n'),s=>stages.push(s));assert.deepEqual(stages,['review']);assert.equal(result.result.text,'Revisão jurídica');
});
test('stream errors are not successes even with HTTP 200; truncated streams fail closed',async()=>{
 const data=await readAssistantResponse(response('{"type":"done","status":504,"data":{"code":"TIMEOUT","error":"Tempo excedido"}}\n'),()=>{});assert.equal(data.code,'TIMEOUT');assert.equal(data.result,undefined);
 await assert.rejects(readAssistantResponse(response('{"type":"heartbeat"}\n'),()=>{}),/STREAM_INTERRUPTED/);
 await assert.rejects(readAssistantResponse(response('{"type":"done"}\n'),()=>{}),/STREAM_INVALID/);
});
test('old JSON deployments remain compatible without repeating requests',async()=>{
 const data=await readAssistantResponse(Response.json({error:'Pedido bloqueado'}),()=>{});assert.equal(data.error,'Pedido bloqueado');
});
