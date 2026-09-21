// Isolated database test; no credentials or external services.
import { PGlite } from "../work/sql-test/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite(); const actor = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
const migration = readFileSync(new URL("../supabase/migrations/005_assistant.sql", import.meta.url), "utf8");
try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public to anon,authenticated,service_role; alter default privileges in schema public grant all on tables to anon,authenticated,service_role;");
  await db.exec(migration); await db.exec(migration);
  await db.query("insert into auth.users values($1),($2)", [actor, other]);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from assistant_requests"), /permission denied/);
    await assert.rejects(db.query("select assistant_begin($1,$2)", [crypto.randomUUID(), actor]), /permission denied/);
    await assert.rejects(db.query("select assistant_finish($1,$2,true)", [crypto.randomUUID(), actor]), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role"); const first = crypto.randomUUID();
  await db.query("select assistant_begin($1,$2)", [first, actor]);
  await assert.rejects(db.query("select assistant_begin($1,$2)", [first, actor]), /DUPLICATE/);
  await assert.rejects(db.query("select assistant_begin($1,$2)", [crypto.randomUUID(), actor]), /BUSY/);
  await db.query("select assistant_finish($1,$2,true)", [first, other]);
  assert.equal((await db.query("select status from assistant_requests where id=$1", [first])).rows[0].status, "processing");
  await db.query("select assistant_finish($1,$2,true)", [first, actor]);
  for (let i = 1; i < 20; i++) { const id = crypto.randomUUID(); await db.query("select assistant_begin($1,$2)", [id, actor]); await db.query("select assistant_finish($1,$2,false)", [id, actor]); }
  await assert.rejects(db.query("select assistant_begin($1,$2)", [crypto.randomUUID(), actor]), /RATE_LIMITED/);
  await db.query("insert into assistant_requests(id,user_id,status) select gen_random_uuid(),$1,'failed' from generate_series(1,180)", [other]);
  await assert.rejects(db.query("select assistant_begin($1,$2)", [crypto.randomUUID(), other]), /RATE_LIMITED/);
  console.log("Assistant SQL: idempotency, permissions, actor isolation, leases, user/global quotas passed.");
} finally { await db.close(); }
