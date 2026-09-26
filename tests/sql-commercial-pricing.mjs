import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try {
 await db.exec(`create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create role anon;create role authenticated;create role service_role bypassrls;create table organizations(id uuid primary key);create table organization_members(organization_id uuid,user_id uuid,role text);`);
 const migrate=async file=>db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 for(const file of ['010_research_jobs.sql','013_inference_wallet.sql','014_live_credit_funding.sql','015_audio_metering.sql'])await migrate(file);
 const call=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
 const actor=randomUUID(),wallet=randomUUID();
 await db.query('insert into auth.users values($1,now())',[actor]);
 // Isolated synthetic fixtures, never real funding.
 await db.query("insert into ai_credit_wallets(id,owner_id,balance_cents,live_customer,live_subscription,active_until) values($1,$2,1000,'cus_fixture','sub_fixture',now()+interval '1 day')",[wallet,actor]);
 const plan=JSON.stringify([{tariff:{model:'fixture',tier:'default',inputNanoUsd:100000,cachedInputNanoUsd:0,outputNanoUsd:0,webSearchNanoUsd:0},maxInput:100,maxOutput:1,maxWebSearchCalls:0}]);
 const fx=JSON.stringify({eurNumerator:1,usdDenominator:1});
 const old=randomUUID();await call('ai_meter_reserve',[actor,wallet,old,10,plan,fx]);
 await migrate('016_commercial_pricing.sql');await migrate('016_commercial_pricing.sql');
 const fresh=randomUUID();await call('ai_meter_reserve_v2',[actor,wallet,fresh,10,plan,fx]);
 await assert.rejects(call('ai_meter_reserve_v2',[actor,wallet,fresh,10,plan,fx]),/METER_DUPLICATE/);
 await assert.rejects(call('ai_meter_settle',[actor,fresh]),/METER_UNCONFIRMED/);
 for(const id of [old,fresh])await call('ai_meter_record',[actor,id,0,JSON.stringify({responseId:'resp_'+id.replaceAll('-',''),model:'fixture',tier:'default',input:100,cachedInput:0,output:0,webSearchCalls:0})]);
 assert.equal(await call('ai_meter_settle',[actor,old]),3);
 assert.equal(await call('ai_meter_settle',[actor,fresh]),4);
 assert.equal(await call('ai_meter_settle',[actor,fresh]),4);
 assert.equal((await db.query('select balance_cents from ai_credit_wallets')).rows[0].balance_cents,993);
 const limited=randomUUID();await call('ai_meter_reserve_v2',[actor,wallet,limited,3,plan,fx]);
 await call('ai_meter_record',[actor,limited,0,JSON.stringify({responseId:'resp_limit',model:'fixture',tier:'default',input:100,cachedInput:0,output:0,webSearchCalls:0})]);
 await assert.rejects(call('ai_meter_settle',[actor,limited]),/METER_CEILING/);
 assert.equal((await db.query('select balance_cents from ai_credit_wallets')).rows[0].balance_cents,993);
 for(const amount of [2000,5000,10000])assert.equal((await call('ai_credit_order_v2',[actor,wallet,randomUUID(),'credits',amount])).amount_cents,amount);
 for(const amount of [null,100,1999,2001,50000])await assert.rejects(call('ai_credit_order_v2',[actor,wallet,randomUUID(),'credits',amount]),/METER_INVALID/);
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  await assert.rejects(call('ai_meter_reserve_v2',[actor,wallet,randomUUID(),10,plan,fx]),/permission denied/);
  await assert.rejects(call('ai_credit_order_v2',[actor,wallet,randomUUID(),'credits',2000]),/permission denied/);
  await db.exec('reset role');
 }
 console.log('Commercial pricing SQL passed: legacy/new prices, one debit, maximum, packs, repeatable migration and permissions.');
} finally {await db.close();}
