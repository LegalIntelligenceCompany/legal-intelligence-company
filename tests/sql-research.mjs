import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '../work/sql-test/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite(),owner=randomUUID(),other=randomUUID();
try {
 await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls;');
 await db.query('insert into auth.users values($1),($2)',[owner,other]);
 const sql=readFileSync(new URL('../supabase/migrations/010_research_jobs.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from research_jobs'));await assert.rejects(db.query("insert into research_jobs(id,owner_id,input,model) values($1,$2,'{}','gpt-5-mini')",[randomUUID(),owner]));await db.exec('reset role');}
 await db.exec('set role service_role');
 const insert=(id,who)=>db.query("insert into research_jobs(id,owner_id,input,model) values($1,$2,'{}','gpt-5-mini')",[id,who]);
 const id=randomUUID();await insert(id,owner);await assert.rejects(insert(randomUUID(),owner),/unique/);await insert(randomUUID(),other);
 await db.query("update research_jobs set state='draft' where id=$1",[id]);
 const claim=()=>db.query("update research_jobs set state='review_starting' where id=$1 and owner_id=$2 and state='draft' returning id",[id,owner]);
 const claims=await Promise.all([claim(),claim()]);assert.equal(claims.reduce((n,r)=>n+r.rows.length,0),1);
 await db.query("update research_jobs set state='completed' where id=$1",[id]);await insert(randomUUID(),owner);
 console.log('Research SQL: idempotency, browser access denied, active owner lock and single review claim passed');
}finally{await db.close();}
