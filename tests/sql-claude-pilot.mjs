import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '../work/sql-test/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite(),owner=randomUUID(),other=randomUUID();
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
try{
 await db.exec('create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create role anon; create role authenticated; create role service_role bypassrls;');
 await db.query("insert into auth.users values($1,'legalintelligencecompany@gmail.com',now()),($2,'other@example.test',now())",[owner,other]);
 await db.exec(migration('009_ai_pilot.sql'));await db.exec(migration('011_pilot_total_10.sql'));
 const sql=migration('017_claude_pilot.sql');await db.exec(sql);await db.exec(sql);
 const reserve=actor=>db.query('select ai_claude_pilot_reserve($1)',[actor]);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(reserve(owner));await assert.rejects(db.query('select * from ai_claude_pilot'));await db.exec('reset role');}
 await assert.rejects(reserve(other),/FORBIDDEN/);
 await db.exec('update ai_pilot_budget set reserved_cents=950');await assert.rejects(reserve(owner),/EXHAUSTED/);
 await db.exec("update ai_pilot_budget set reserved_cents=750, expires_at='2000-01-01'");await assert.rejects(reserve(owner),/EXPIRED/);
 await db.exec("update ai_pilot_budget set expires_at='2026-09-29 23:59:59+00'; set role service_role");
 const result=await Promise.allSettled([reserve(owner),reserve(owner)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.query('select reserved_cents from ai_pilot_budget')).rows[0].reserved_cents,850);
 await db.exec('reset role');await db.exec(sql);await assert.rejects(reserve(owner),/DUPLICATE/);
 assert.equal((await db.query('select reserved_cents from ai_pilot_budget')).rows[0].reserved_cents,850);
 console.log('Claude pilot SQL: permissions, owner, insufficient funds, expiry, concurrency, no reset passed');
}finally{await db.close();}
