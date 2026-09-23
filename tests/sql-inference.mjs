import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '../work/sql-test/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite();
try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
 create role anon;create role authenticated;create role service_role bypassrls;
 create table organizations(id uuid primary key);create table organization_members(organization_id uuid,user_id uuid,role text);`);
 await db.exec(readFileSync(new URL('../supabase/migrations/010_research_jobs.sql',import.meta.url),'utf8'));
 const sql=readFileSync(new URL('../supabase/migrations/013_inference_wallet.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const [a,b,c,d,w,org]=Array.from({length:6},randomUUID);
 for(const id of [a,b,c,d])await db.query('insert into auth.users values($1,now())',[id]);
 await db.query('insert into organizations values($1)',[org]);
 for(const id of [a,b,c,d])await db.query("insert into organization_members values($1,$2,'member')",[org,id]);
 // Synthetic database fixtures only, NOT a top-up API or a real paid invoice.
 await db.query("insert into ai_credit_wallets(id,owner_id,organization_id,balance_cents,live_customer,live_subscription,active_until) values($1,$2,$3,100,'cus_fixture','sub_fixture',now()+interval '1 day')",[w,a,org]);
 for(const id of [a,b,c])await db.query('insert into ai_credit_seats values($1,$2)',[w,id]);
 const tariff={id:'fixture',model:'fixture',tier:'default',inputNanoUsd:1000,cachedInputNanoUsd:100,outputNanoUsd:1000,webSearchNanoUsd:10000000,maxInputTokens:1000};
 const plan=[{tariff,maxInput:1000,maxOutput:1000,maxWebSearchCalls:2},{tariff,maxInput:1000,maxOutput:1000,maxWebSearchCalls:2}];
 const exchange={id:'fixture',eurNumerator:9,usdDenominator:10};
 const call=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
 const reserve=(id,actor=a,ceiling=60)=>call('ai_meter_reserve',[actor,w,id,ceiling,JSON.stringify(plan),JSON.stringify(exchange)]);
 const state=async()=>(await db.query('select balance_cents,reserved_cents from ai_credit_wallets where id=$1',[w])).rows[0];
 const id=randomUUID();await reserve(id);
 await assert.rejects(reserve(id),/METER_DUPLICATE/);
 await assert.rejects(reserve(randomUUID(),d,1),/METER_FORBIDDEN/);
 await assert.rejects(reserve(randomUUID(),b),/METER_BALANCE/);
 await assert.rejects(call('ai_meter_settle',[a,id]),/METER_UNCONFIRMED/);
 assert.equal(Number((await state()).reserved_cents),60);
 const usage={responseId:'resp_one',model:'fixture',tier:'default',input:100,cachedInput:0,output:100,webSearchCalls:0};
 await assert.rejects(call('ai_meter_record',[b,id,0,JSON.stringify(usage)]),/METER_FORBIDDEN/);
 await call('ai_meter_record',[a,id,0,JSON.stringify(usage)]);
 await call('ai_meter_record',[a,id,0,JSON.stringify(usage)]);
 await assert.rejects(call('ai_meter_record',[a,id,0,JSON.stringify({...usage,output:99})]),/METER_CONFLICT/);
 await assert.rejects(call('ai_meter_record',[a,id,1,JSON.stringify({...usage,responseId:'resp_two',model:'wrong'})]),/METER_TARIFF/);
 await assert.rejects(call('ai_meter_record',[a,id,1,JSON.stringify({...usage,responseId:'resp_two',input:1001})]),/METER_CEILING/);
 await call('ai_meter_record',[a,id,1,JSON.stringify({...usage,responseId:'resp_two'})]);
 const settled=await Promise.all(Array.from({length:4},()=>call('ai_meter_settle',[a,id])));assert.deepEqual(settled,[1,1,1,1]);
 assert.equal(Number((await state()).balance_cents),99);assert.equal(Number((await state()).reserved_cents),0);
 assert.equal((await db.query('select * from ai_credit_movements')).rows.length,1);
 const concurrent=await Promise.allSettled(Array.from({length:5},()=>reserve(randomUUID(),b,30)));
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,3);assert.equal(Number((await state()).reserved_cents),90);
 await db.query('delete from organization_members where organization_id=$1 and user_id=$2',[org,b]);
 await assert.rejects(reserve(randomUUID(),b,1),/METER_FORBIDDEN/);
 assert.deepEqual(await call('ai_meter_wallets',[b]),[]);
 await db.query('update ai_credit_wallets set frozen=true where id=$1',[w]);
 await assert.rejects(reserve(randomUUID(),a,1),/METER_FROZEN/);
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from ai_credit_wallets'),/permission denied/);
  await assert.rejects(call('ai_meter_settle',[a,id]),/permission denied/);await db.exec('reset role');
 }
 console.log('Inference SQL passed: repeatable migration, receipt recovery, one debit, insufficient funds, concurrency, membership and RLS.');
}finally{await db.close();}
