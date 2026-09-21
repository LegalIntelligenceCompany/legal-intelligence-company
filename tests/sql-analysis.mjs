// Isolated PostgreSQL/WASM integration test. Never connects to Supabase or reads .env.local.
// First: npm install --prefix work/sql-test --no-save --ignore-scripts @electric-sql/pglite
import { PGlite } from "../work/sql-test/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const userA = "10000000-0000-4000-8000-000000000001", userB = "10000000-0000-4000-8000-000000000002";
const orgA = "20000000-0000-4000-8000-000000000001", orgB = "20000000-0000-4000-8000-000000000002";
const docA = "30000000-0000-4000-8000-000000000001", docB = "30000000-0000-4000-8000-000000000002", docA2 = "30000000-0000-4000-8000-000000000003";
let checks = 0;
async function denied(sql, params, pattern) { await assert.rejects(db.query(sql, params), pattern); checks++; }
async function begin(actor = userA, doc = docA, org = orgA, rerun = false) {
  return (await db.query("select public.analysis_begin($1,$2,$3,'gpt-5-mini',$4) as result", [actor, doc, org, rerun])).rows[0].result;
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant all on storage.objects to anon,authenticated,service_role;
  `);
  for (const name of ["001_initial_schema", "002_team", "003_documents", "004_analysis"]) {
    let sql = readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
    // Only extension substitution: PGlite uses core UUID generation instead of uuid-ossp.
    if (name === "001_initial_schema") sql = sql.replace('create extension if not exists "uuid-ossp";', "").replaceAll("uuid_generate_v4()", "gen_random_uuid()");
    await db.exec(sql);
  }
  await db.exec(readFileSync(new URL("../supabase/migrations/004_analysis.sql", import.meta.url), "utf8")); checks++;
  await db.exec(readFileSync(new URL("../supabase/tests/documents_access.sql", import.meta.url), "utf8")); checks++;
  await db.query("insert into auth.users(id) values($1),($2)", [userA, userB]);
  await db.query("insert into public.organizations(id,name) values($1,'Empresa A'),($2,'Empresa B')", [orgA, orgB]);
  await db.query("insert into public.organization_members values($1,$2,'owner'),($3,$4,'owner')", [orgA, userA, orgB, userB]);
  for (const [id, org] of [[docA, orgA], [docA2, orgA], [docB, orgB]]) await db.query("insert into public.contracts(id,organization_id,filename,storage_path,status,byte_size,mime_type) values($1,$2,'test.pdf',$3,'uploaded',100,'application/pdf')", [id, org, `${org}/${id}.pdf`]);
  await db.query("insert into public.policies(organization_id,title,content) values($1,'Prazo','Exigir aviso prévio de 30 dias.')", [orgA]);
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userA]);
  await denied("select public.analysis_begin($1,$2,$3,'gpt-5-mini',false)", [userA, docA, orgA], /permission denied/);
  await denied("insert into public.contract_analyses(contract_id,organization_id,status,model) values($1,$2,'processing','forged')", [docA, orgA], /permission denied/);
  await denied("select public.analysis_finish($1,$2,null,'forged')", [docA, userA], /permission denied/);
  await db.exec("reset role; set role anon");
  await denied("select * from public.contract_analyses", [], /permission denied/);
  await denied("select public.analysis_begin($1,$2,$3,'gpt-5-mini',false)", [userA, docA, orgA], /permission denied/);
  await db.exec("reset role; set role service_role");
  await assert.rejects(begin(userB), /FORBIDDEN/); checks++;
  await assert.rejects(begin(userA, docB, orgA), /NOT_FOUND/); checks++;
  const first = await begin(); assert.equal(first.created, true); assert.equal(first.job.policy_snapshot.length, 1); checks++;
  const duplicate = await begin(); assert.equal(duplicate.created, false); assert.equal(duplicate.job.id, first.job.id); checks++;
  await assert.rejects(begin(userA, docA2), /ANALYSIS_BUSY/); checks++;
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userB]);
  assert.equal((await db.query("select * from public.contract_analyses")).rows.length, 0); checks++;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userA]);
  assert.equal((await db.query("select * from public.contract_analyses")).rows.length, 1); checks++;
  await denied("update public.contract_analyses set status='failed'", [], /permission denied/);
  await db.query("update public.policies set content='Novo aviso prévio de 60 dias.' where organization_id=$1", [orgA]);
  assert.match((await db.query("select policy_snapshot from public.contract_analyses")).rows[0].policy_snapshot[0].content, /30 dias/); checks++;
  await db.exec("reset role; set role service_role");
  const report = { document_readable: true, summary: "Teste", limitations: [], findings: [] };
  assert.equal((await db.query("select public.analysis_finish($1,$2,$3,null) as ok", [first.job.id, userB, report])).rows[0].ok, false); checks++;
  assert.equal((await db.query("select public.analysis_finish($1,$2,$3,null) as ok", [first.job.id, userA, report])).rows[0].ok, true); checks++;
  assert.equal((await db.query("select public.analysis_finish($1,$2,$3,null) as ok", [first.job.id, userA, report])).rows[0].ok, false); checks++;
  assert.equal((await begin()).created, false); checks++;
  const rerun = await begin(userA, docA, orgA, true); assert.equal(rerun.created, true); assert.match(rerun.job.policy_snapshot[0].content, /60 dias/); checks++;
  await db.query("update public.contract_analyses set lease_until=now()-interval '1 second' where id=$1", [rerun.job.id]);
  assert.equal((await db.query("select public.analysis_finish($1,$2,$3,null) as ok", [rerun.job.id, userA, report])).rows[0].ok, false); checks++;
  const recovered = await begin(); assert.equal(recovered.created, true); checks++;
  assert.equal((await db.query("select error_code from public.contract_analyses where id=$1", [rerun.job.id])).rows[0].error_code, "TIMEOUT"); checks++;
  await db.exec("reset role");
  await db.query("delete from public.organization_members where organization_id=$1 and user_id=$2", [orgA, userA]);
  await db.exec("set role service_role");
  assert.equal((await db.query("select public.analysis_finish($1,$2,$3,null) as ok", [recovered.job.id, userA, report])).rows[0].ok, false); checks++;
  await db.exec("reset role");
  await db.query("insert into public.organization_members values($1,$2,'owner')", [orgA, userA]);
  await db.query("insert into public.contract_analyses(contract_id,organization_id,status,model,error_code) select $1,$2,'failed','test','TIMEOUT' from generate_series(1,20)", [docA, orgA]);
  await db.exec("set role service_role");
  await assert.rejects(begin(), /RATE_LIMITED/); checks++;
  console.log(`SQL: ${checks} checks passed; migrations 001–004, tenant isolation, write protection, duplicate prevention, snapshots, expiry, revocation and limits. Existing documents_access.sql also passed. No remote data accessed.`);
} finally { await db.close(); }
