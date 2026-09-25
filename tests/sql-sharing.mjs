import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '../work/sql-test/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite();
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333',d='44444444-4444-4444-8444-444444444444',org='55555555-5555-4555-8555-555555555555';
async function as(user){await db.exec('reset role; set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);}
try{
 await db.exec("create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; create table public.organizations(id uuid primary key); create table public.organization_members(organization_id uuid references organizations(id),user_id uuid references auth.users(id),role text,primary key(organization_id,user_id)); alter table organization_members enable row level security; grant select on organization_members to authenticated; create policy own on organization_members for select to authenticated using(user_id=auth.uid());");
 await db.exec(readFileSync(new URL('../supabase/migrations/007_library.sql',import.meta.url),'utf8'));
 const sql=readFileSync(new URL('../supabase/migrations/019_dossier_sharing.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 await db.query('insert into auth.users values ($1),($2),($3)',[a,b,c]);await db.query('insert into organizations values ($1)',[org]);await db.query("insert into organization_members values ($1,$2,'owner'),($1,$3,'member')",[org,a,b]);
 await as(a);await db.query("insert into research_dossiers(id,title) values ($1,'Privado')",[d]);await db.query("insert into research_entries(dossier_id,title,body) values ($1,'V1','Texto')",[d]);
 await as(b);assert.equal((await db.query('select * from research_dossiers')).rows.length,0);
 await assert.rejects(db.query('select research_share($1,$2,$3,true)',[d,org,b]));
 await as(a);await assert.rejects(db.query('select research_share($1,$2,$3,true)',[d,org,c]));await db.query('select research_share($1,$2,$3,true)',[d,org,b]);await db.query('select research_share($1,$2,$3,true)',[d,org,b]);
 assert.equal((await db.query('select research_access_state($1) as grants',[d])).rows[0].grants.length,1);
 await as(b);assert.equal((await db.query('select * from research_entries')).rows.length,1);assert.equal((await db.query('select * from research_dossiers')).rows.length,1);
 await assert.rejects(db.query("update research_entries set body='Alterado' returning id"));assert.equal((await db.query('delete from research_dossiers returning id')).rows.length,0);
 await assert.rejects(db.query('select research_access_state($1)',[d]));await assert.rejects(db.query('select * from research_dossier_access'));
 await assert.rejects(db.query("insert into research_entries(dossier_id,owner_id,title,body) values ($1,$2,'x','x')",[d,a]));
 await assert.rejects(db.query("select research_append($1,gen_random_uuid(),'Não autorizado','x','[]',null)",[d]));
 await as(a);await db.query("select research_share($1,$2,$3,true,'editor')",[d,org,b]);
 await as(b);const prior=(await db.query('select id from research_entries where dossier_id=$1',[d])).rows[0].id;
 await db.query("select research_append($1,gen_random_uuid(),'V2','Revisão pelo membro','[]',$2)",[d,prior]);
 const revised=(await db.query("select * from research_entries where title='V2'")).rows[0];assert.equal(revised.created_by,b);assert.equal(revised.owner_id,a);assert.equal(revised.revision_of,prior);
 assert.equal((await db.query('select research_editable_dossiers() as ids')).rows[0].ids.includes(d),true);
 await assert.rejects(db.query('select research_share($1,$2,$3,true)',[d,org,c]));
 assert.equal((await db.query('delete from research_entries returning id')).rows.length,0);
 await as(a);await db.query("select research_share($1,$2,$3,true,'viewer')",[d,org,b]);
 await as(b);await assert.rejects(db.query("select research_append($1,gen_random_uuid(),'Bloqueado','x','[]',null)",[d]));
 await as(c);assert.equal((await db.query('select * from research_entries')).rows.length,0);
 await as(a);await db.query('select research_share($1,$2,$3,false)',[d,org,b]);await as(b);assert.equal((await db.query('select * from research_entries')).rows.length,0);
 await as(a);await db.query('select research_share($1,$2,$3,true)',[d,org,b]);await db.exec('reset role');await db.query('delete from organization_members where user_id=$1',[b]);await db.query("insert into organization_members values ($1,$2,'member')",[org,b]);await as(b);assert.equal((await db.query('select * from research_entries')).rows.length,0,'rejoining must not restore access');
 await as(a);await db.query('select research_share($1,$2,$3,true)',[d,org,b]);await db.exec('reset role');await db.query('delete from organization_members where user_id=$1',[a]);await as(b);assert.equal((await db.query('select * from research_entries')).rows.length,0,'owner departure revokes access');
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select research_can_read($1)',[d]));
 console.log('Sharing SQL: private default, explicit member viewer/editor access, immutable versions, authorship, isolation, revocation, departure, no automatic rejoin, repeatability passed');
}finally{await db.close();}
