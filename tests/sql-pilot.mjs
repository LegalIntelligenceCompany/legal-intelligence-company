import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '../work/sql-test/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite(),owner=randomUUID(),other=randomUUID();
try {
 await db.exec('create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create role anon; create role authenticated; create role service_role bypassrls;');
 await db.query("insert into auth.users values($1,'legalintelligencecompany@gmail.com',now()),($2,'other@example.com',now())",[owner,other]);
 const sql=readFileSync(new URL('../supabase/migrations/009_ai_pilot.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 // Use the real date-bound function: this pilot intentionally expires.
 const reserve=(actor,id,kind)=>db.query('select ai_pilot_reserve($1,$2,$3)',[actor,id,kind]);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from ai_pilot_budget'));await assert.rejects(reserve(owner,randomUUID(),'research'));await db.exec('reset role');}
 await db.exec('set role service_role');
 await assert.rejects(reserve(other,randomUUID(),'research'),/PILOT_FORBIDDEN/);
 const id=randomUUID();await reserve(owner,id,'research');await assert.rejects(reserve(owner,id,'research'),/PILOT_DUPLICATE/);
 const concurrent=await Promise.allSettled(Array.from({length:4},()=>reserve(owner,randomUUID(),'research')));
 assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,2);
 await assert.rejects(reserve(owner,randomUUID(),'document'),/PILOT_EXHAUSTED/);
 await reserve(owner,randomUUID(),'transcription');await reserve(owner,randomUUID(),'transcription');await assert.rejects(reserve(owner,randomUUID(),'transcription'),/PILOT_EXHAUSTED/);
 assert.equal((await db.query('select reserved_cents from ai_pilot_budget')).rows[0].reserved_cents,490);
 await db.exec('reset role');await db.exec(sql);assert.equal((await db.query('select reserved_cents from ai_pilot_budget')).rows[0].reserved_cents,490);
 const upgrade=readFileSync(new URL('../supabase/migrations/011_pilot_total_10.sql',import.meta.url),'utf8');await db.exec(upgrade);await db.exec(upgrade);
 assert.equal((await db.query('select reserved_cents,limit_cents from ai_pilot_budget')).rows[0].reserved_cents,490);
 assert.equal((await db.query('select limit_cents from ai_pilot_budget')).rows[0].limit_cents,1000);
 const advanced=await Promise.allSettled([reserve(owner,randomUUID(),'research-advanced'),reserve(owner,randomUUID(),'research-advanced')]);assert.equal(advanced.filter(r=>r.status==='fulfilled').length,1);
 await reserve(owner,randomUUID(),'document');assert.equal((await db.query('select reserved_cents from ai_pilot_budget')).rows[0].reserved_cents,1000);
 await assert.rejects(reserve(owner,randomUUID(),'transcription'),/PILOT_EXHAUSTED/);
 await db.exec(upgrade);assert.equal((await db.query('select reserved_cents from ai_pilot_budget')).rows[0].reserved_cents,1000);
 await db.exec("update ai_pilot_budget set expires_at='2000-01-01'");await assert.rejects(reserve(owner,randomUUID(),'transcription'),/PILOT_EXPIRED/);
 console.log('Pilot SQL: permissions, owner, duplicates, concurrent cap, no reset and expiry passed');
}finally{await db.close();}
