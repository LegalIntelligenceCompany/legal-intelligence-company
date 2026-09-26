import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(),actor='10000000-0000-4000-8000-000000000001',id=crypto.randomUUID();
try{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create table public.organizations(id uuid primary key); grant usage on schema public to anon,authenticated,service_role; alter default privileges in schema public grant all on tables to anon,authenticated,service_role;');
 const sql=readFileSync(new URL('../supabase/migrations/018_result_recovery.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 await db.query('insert into auth.users values($1)',[actor]);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from service_results'),/permission denied/);await assert.rejects(db.query('delete from service_results'),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');await db.query("insert into service_results(id,actor_id,kind) values($1,$2,'assistant')",[id,actor]);await assert.rejects(db.query("insert into service_results(id,actor_id,kind) values($1,$2,'assistant')",[id,actor]),/duplicate key/);
 assert.equal((await db.query('select expires_at > created_at as retained from service_results')).rows[0].retained,true);
 await assert.rejects(db.query("update service_results set result=jsonb_build_object('text',repeat('x',500001))"),/check constraint/);
 await db.query("update service_results set expires_at=now()-interval '1 second'");await db.query('delete from service_results where expires_at<now()');assert.equal((await db.query('select count(*)::int as n from service_results')).rows[0].n,0);
 console.log('Recovery SQL: repeatable migration, restricted access, uniqueness, size bound and expiry cleanup passed.');
}finally{await db.close();}
