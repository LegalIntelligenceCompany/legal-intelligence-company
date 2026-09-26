import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create role anon;create role authenticated;create role service_role bypassrls;create table organizations(id uuid primary key);create table organization_members(organization_id uuid,user_id uuid,role text);`);
 for(const file of ['010_research_jobs.sql','013_inference_wallet.sql','014_live_credit_funding.sql','014_live_credit_funding.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const call=async(name,args)=>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
 const [a,b,c,d,org]=Array.from({length:5},randomUUID);
 for(const id of [a,b,c,d])await db.query('insert into auth.users values($1,now())',[id]);
 await db.query('insert into organizations values($1)',[org]);
 for(const id of [a,b,c,d])await db.query('insert into organization_members values($1,$2,$3)',[org,id,id===a?'owner':'member']);
 const w=await call('ai_credit_open',[a,null]);assert.equal(await call('ai_credit_open',[a,null]),w);
 const state=async()=>(await db.query('select * from ai_credit_wallets where id=$1',[w])).rows[0];assert.equal((await state()).balance_cents,0);
 await assert.rejects(call('ai_credit_order',[b,w,randomUUID(),'access',4900]),/METER_FORBIDDEN/);
 await assert.rejects(call('ai_credit_order',[a,w,randomUUID(),'credits',1000]),/METER_SUBSCRIPTION/);
 const access=randomUUID();await call('ai_credit_order',[a,w,access,'access',4900]);
 await assert.rejects(call('ai_credit_order',[a,w,randomUUID(),'access',4900]),/ACCESS_EXISTS/);
 await call('ai_credit_bind',[access,'cs_live_access']);
 await assert.rejects(call('ai_credit_bind',[access,'cs_live_other']),/METER_CONFLICT/);
 const until=new Date(Date.now()+86400000).toISOString();
 await call('ai_credit_fulfill',[access,'cs_live_access','cus_one','sub_one',until,false]);assert.equal((await state()).balance_cents,0);
 const topup=randomUUID();await call('ai_credit_order',[a,w,topup,'credits',1000]);await call('ai_credit_bind',[topup,'cs_live_topup']);
 await assert.rejects(call('ai_credit_fulfill',[topup,'cs_live_topup','cus_other','pi_one',null,false]),/METER_CONFLICT/);
 await Promise.all(Array.from({length:4},()=>call('ai_credit_fulfill',[topup,'cs_live_topup','cus_one','pi_one',null,false])));
 assert.equal((await state()).balance_cents,1000);assert.equal((await db.query('select * from ai_credit_movements')).rows.length,1);
 await call('ai_credit_fulfill',[topup,'cs_live_topup','cus_one','pi_one',null,true]);
 await call('ai_credit_fulfill',[topup,'cs_live_topup','cus_one','pi_one',null,false]);assert.equal((await state()).frozen,true);
 await assert.rejects(call('ai_credit_order',[a,w,randomUUID(),'credits',1000]),/METER_FORBIDDEN/);
 const company=await call('ai_credit_open',[a,org]);await call('ai_credit_member',[a,company,b,true]);await call('ai_credit_member',[a,company,c,true]);
 await assert.rejects(call('ai_credit_member',[a,company,d,true]),/SEAT_LIMIT/);
 await assert.rejects(call('ai_credit_member',[b,company,c,false]),/METER_FORBIDDEN/);
 await call('ai_credit_member',[a,company,b,false]);await call('ai_credit_member',[a,company,d,true]);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(call('ai_credit_open',[a,null]),/permission denied/);await assert.rejects(db.query('select * from ai_credit_orders'),/permission denied/);await db.exec('reset role');}
 console.log('Live funding SQL passed: zero seeded money, fixed plans, confirmed top-ups, concurrent replay, freeze, three seats and permissions.');
}finally{await db.close();}
