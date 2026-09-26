import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let restored;
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333',d='44444444-4444-4444-8444-444444444444',org='55555555-5555-4555-8555-555555555555',privateD='66666666-6666-4666-8666-666666666666';
async function as(user,conn=db){await conn.exec('reset role; set role authenticated');await conn.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);}
try{
 await db.exec("create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; create table organizations(id uuid primary key); create table organization_members(organization_id uuid references organizations(id),user_id uuid references auth.users(id),role text,primary key(organization_id,user_id)); alter table organization_members enable row level security; grant select on organization_members to authenticated; create policy own on organization_members for select to authenticated using(user_id=auth.uid()); create table research_jobs(id uuid primary key,owner_id uuid references auth.users(id) on delete cascade,response_id text);");
 for(const name of ['007_library','019_dossier_sharing','020_workspace','020_workspace'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values ($1),($2),($3)',[a,b,c]);await db.query('insert into organizations values ($1)',[org]);await db.query("insert into organization_members values ($1,$2,'owner'),($1,$3,'member')",[org,a,b]);
 await as(c);await db.query("insert into research_dossiers(id,title) values ($1,'Outro cliente')",[privateD]);await db.query("insert into research_entries(dossier_id,title,body) values ($1,'Segredo','Contrato ultrassecreto')",[privateD]);
 await as(a);await db.query("insert into research_dossiers(id,title) values ($1,'Processo autorizado')",[d]);
 await db.query("insert into research_entries(dossier_id,title,body) values ($1,'Prova',$2)",[d,JSON.stringify({type:'lic-case-v1',text:'Contrato fictício e prazo de entrega.',reference:'Prova 42',jurisdiction:'Portugal'})]);
 await db.query("insert into research_entries(dossier_id,title,body) values ($1,'Nota','{não é JSON')",[d]);
 let hits=(await db.query("select * from research_search('contrato')")).rows;assert.equal(hits.length,1);assert.ok(hits[0].body.startsWith('Contrato'));assert.ok(!hits[0].body.includes('lic-case'));
 assert.equal((await db.query("select * from research_search('contrato',$1)",[privateD])).rows.length,0);
 assert.equal((await db.query("select * from research_search('a')")).rows.length,0);
 assert.equal((await db.query("select * from research_search($1)",['a'.repeat(201)])).rows.length,0);
 assert.equal((await db.query('select * from research_audit')).rows.length,2);
 await assert.rejects(db.query("insert into research_audit(owner_id,dossier_id,operation) values ($1,$2,'INSERT')",[a,d]));
 await assert.rejects(db.query('update research_audit set actor_id=$1',[c]));await assert.rejects(db.query('delete from research_audit'));
 await assert.rejects(db.query('select * from research_delivery_receipts'));
 await db.query("select research_share($1,$2,$3,true,'viewer')",[d,org,b]);
 await as(b);assert.equal((await db.query("select * from research_search('contrato')")).rows.length,1);assert.equal((await db.query('select * from research_audit')).rows.length,0);
 await assert.rejects(db.query("select research_append($1,gen_random_uuid(),'V2','Contrato alterado','[]',null)",[d]));
 await as(a);await db.query("select research_share($1,$2,$3,true,'editor')",[d,org,b]);
 await as(b);const entry='77777777-7777-4777-8777-777777777777';await db.query("select research_append($1,$2,'V2','Contrato alterado','[]',null)",[d,entry]);await db.query("select research_append($1,$2,'V2','Contrato alterado','[]',null)",[d,entry]);
 await assert.rejects(db.query("select research_append($1,$2,'V2','Conteúdo diferente','[]',null)",[d,entry]));
 await as(a);await assert.rejects(db.query("select research_append($1,$2,'V2','Contrato alterado','[]',null)",[d,entry]));const events=(await db.query('select * from research_audit where entry_id=$1',[entry])).rows;assert.equal(events.length,1);assert.equal(events[0].actor_id,b);
 await db.query('select research_share($1,$2,$3,false)',[d,org,b]);await as(b);assert.equal((await db.query("select * from research_search('contrato')")).rows.length,0);
 await as(a);const start=performance.now();await db.query("insert into research_entries(dossier_id,title,body) select $1,'Nota '||n,'Contrato fictício carga '||n from generate_series(1,997) n",[d]);
 hits=(await db.query("select * from research_search('contrato')")).rows;assert.equal(hits.length,50);
 console.log('Workspace SQL: 1000 synthetic records + bounded RLS search: '+Math.round(performance.now()-start)+' ms (local, not production load validation)');
 await db.exec('reset role');await db.query("insert into research_jobs values ($1,$2,'resp_fixture')",[d,a]);await db.exec('set role service_role');await db.query("insert into research_delivery_receipts(event_id,response_id,job_id) values ('evt_fixture','resp_fixture',$1)",[d]);await db.exec('reset role; set role anon');await assert.rejects(db.query("select * from research_search('contrato')"));await assert.rejects(db.query('select * from research_delivery_receipts'));
 await db.exec('reset role');const count=(await db.query('select count(*)::int n from research_entries')).rows[0].n;const snapshot=await db.dumpDataDir();restored=new PGlite({loadDataDir:snapshot});
 assert.equal((await restored.query('select count(*)::int n from research_entries')).rows[0].n,count);await as(b,restored);assert.equal((await restored.query("select * from research_search('contrato')")).rows.length,0);await as(a,restored);assert.equal((await restored.query("select * from research_search('contrato')")).rows.length,50);
 await restored.exec('reset role');await restored.query('delete from organization_members where user_id=$1',[a]);await restored.query('delete from auth.users where id=$1',[a]);assert.equal((await restored.query('select * from research_audit where owner_id=$1',[a])).rows.length,0);assert.equal((await restored.query('select * from research_delivery_receipts')).rows.length,0);
 console.log('Workspace SQL: repeatable migration, private/authorized search, editor audit, revocation, idempotent append, metadata-only audit access, receipt isolation, backup + restore and account deletion passed');
}finally{await restored?.close();await db.close();}
