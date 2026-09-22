import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotModule} from './pilot-helper.mjs';
const pilot=pilotModule(true);
test('pilot requires exact confirmed email and defaults off',()=>{
 assert.equal(pilotModule().pilotEnabled(),false);
 for(const user of [null,{}, {email:pilot.PILOT_EMAIL},{email:'other@example.com',email_confirmed_at:'yes'}])assert.equal(pilot.pilotAccount(user),false);
 assert.equal(pilot.pilotAccount({email:pilot.PILOT_EMAIL,email_confirmed_at:'yes'}),true);
});
test('pilot budget fails closed without a true reservation result',async()=>{
 for(const result of [{},{data:false},{data:null,error:{message:'missing'}},{data:true,error:{message:'PILOT_EXHAUSTED'}}])await assert.rejects(pilot.reservePilot({rpc:async()=>result},'actor','id','research'));
 let count=0;await pilot.reservePilot({rpc:async()=>{count++;return {data:true};}},'actor','id','document');assert.equal(count,1);
});
export function pcm(seconds=1){const bytes=Buffer.alloc(44+16000*seconds);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);return bytes;}
test('pilot validates actual WAV duration and rejects malformed or compressed containers',()=>{
 pilot.validatePilotWav(pcm(60),'wav');
 for(const [bytes,ext] of [[pcm(61),'wav'],[pcm(),'mp3'],[Buffer.alloc(12),'wav'],[pcm().subarray(0,48),'wav']])assert.throws(()=>pilot.validatePilotWav(bytes,ext),/PILOT_AUDIO/);
 for(const [offset,value] of [[20,3],[22,0],[32,4],[34,8]]){const bytes=pcm();bytes.writeUInt16LE(value,offset);assert.throws(()=>pilot.validatePilotWav(bytes,'wav'));}
});
