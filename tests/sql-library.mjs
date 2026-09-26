import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec("create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated;");
 const sql=readFileSync(new URL('../supabase/migrations/007_library.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',d='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values ($1),($2)',[a,b]);await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
 await db.query("insert into research_dossiers(id,title) values ($1,'Privado')",[d]);await db.query("insert into research_entries(dossier_id,title,body) values ($1,'Nota','Texto')",[d]);
 await db.exec('reset role');
 const clauses=readFileSync(new URL('../supabase/migrations/008_clauses.sql',import.meta.url),'utf8');await db.exec(clauses);await db.exec(clauses);await db.exec(sql);await db.exec(clauses);
 await db.exec('set role authenticated');
 assert.equal((await db.query('select * from research_entries')).rows.length,1);
 const c='44444444-4444-4444-8444-444444444444';
 await db.query("insert into research_dossiers(id,kind,title) values ($1,'clause','Responsabilidade')",[c]);
 await db.query("insert into research_entries(dossier_id,title,body) values ($1,'V1','Primeira versão'),($1,'V2','Segunda versão')",[c]);
 assert.equal((await db.query('select * from research_entries where dossier_id=$1',[c])).rows.length,2);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);assert.equal((await db.query('select * from research_entries')).rows.length,0);assert.equal((await db.query('select * from research_dossiers')).rows.length,0);
 await assert.rejects(db.query("insert into research_entries(dossier_id,title,body) values ($1,'Invasão','x')",[d]));
 await assert.rejects(db.query("insert into research_entries(dossier_id,title,body) values ($1,'Invasão','x')",[c]));
 assert.equal((await db.query("update research_dossiers set title='Alterado' where id=$1 returning id",[c])).rows.length,0);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await db.query('delete from research_dossiers where id=$1',[c]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await db.query('delete from research_dossiers where id=$1',[d]);assert.equal((await db.query('select * from research_entries')).rows.length,0);
 console.log('Library SQL: repeatability, owner isolation, foreign-key ownership and cascade passed');
}finally{await db.close();}
