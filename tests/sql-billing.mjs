import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '../work/sql-test/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
try {
  await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls;');
  const sql = readFileSync(new URL('../supabase/migrations/006_billing.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  const a = randomUUID(), b = randomUUID();
  await db.query('insert into auth.users values ($1),($2)', [a,b]);
  const call = async (fn,args) => (await db.query(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as v`,args)).rows[0].v;
  const lock = await call('billing_test_lock',[a]);
  await assert.rejects(call('billing_test_lock',[a]), /BUSY/);
  await assert.rejects(call('billing_test_bind',[a,null,'cus_a']), /BUSY/);
  await call('billing_test_bind',[a,lock.lock_token,'cus_a']);
  await assert.rejects(call('billing_test_bind',[a,lock.lock_token,'cus_other']), /CUSTOMER_CONFLICT/);
  await assert.rejects(call('billing_test_checkout',[a,lock.lock_token,'cs_live_fake',false]), /INVALID/);
  const k = await call('billing_test_checkout',[a,lock.lock_token,'cs_test_fake',false]);
  assert.equal(k,lock.checkout_key);
  assert.notEqual(await call('billing_test_checkout',[a,lock.lock_token,null,true]),k);
  const row = { id:'sub_a', price_id:'price_test', status:'active', period_start:new Date(Date.now()-86400000).toISOString(),period_end:new Date(Date.now()+86400000).toISOString(),cancel_at_period_end:true,paid:true };
  const sync = (rows,event=null,token=lock.lock_token) => call('billing_test_sync',[a,token,JSON.stringify(rows),event]);
  await sync([row],'evt_once');
  await sync([],'evt_once');
  assert.equal((await db.query('select count(*)::int n from billing_test_subscriptions')).rows[0].n,1);
  const first = randomUUID();
  assert.equal((await call('billing_test_use',[a,first,'assistant'])).used,1);
  assert.equal((await call('billing_test_use',[a,first,'assistant'])).duplicate,true);
  await assert.rejects(call('billing_test_use',[a,first,'analysis']), /FORBIDDEN/);
  const attempts = await Promise.allSettled(Array.from({length:22},()=>call('billing_test_use',[a,randomUUID(),'assistant'])));
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,19);
  for(let i=0;i<5;i++) await call('billing_test_use',[a,randomUUID(),'analysis']);
  await assert.rejects(call('billing_test_use',[a,randomUUID(),'analysis']), /QUOTA_EXCEEDED/);
  const lb = await call('billing_test_lock',[b]);
  await assert.rejects(call('billing_test_bind',[b,lb.lock_token,'cus_a']), /unique/);
  await call('billing_test_sync',[b,lb.lock_token,'[]',null]);
  await assert.rejects(call('billing_test_use',[b,first,'assistant']), /FORBIDDEN/);
  await assert.rejects(call('billing_test_use',[b,randomUUID(),'assistant']), /SUBSCRIPTION_REQUIRED/);
  // Failed cross-account snapshot must not partially delete or consume its event.
  await assert.rejects(call('billing_test_sync',[b,lb.lock_token,JSON.stringify([row]),'evt_bad']), /unique/);
  assert.equal((await db.query("select count(*)::int n from billing_test_events where id='evt_bad'")).rows[0].n,0);
  await db.query("update billing_test_usage set created_at=now()-interval '2 days' where user_id=$1",[a]);
  await sync([{...row,period_start:new Date(Date.now()-1000).toISOString()}]);
  assert.equal((await call('billing_test_use',[a,randomUUID(),'assistant'])).used,1);
  for(const patch of [{paid:false},{status:'past_due'},{status:'canceled'},{period_end:new Date(Date.now()-1000).toISOString()}]) {
    await sync([{...row,...patch}]);
    await assert.rejects(call('billing_test_use',[a,randomUUID(),'assistant']), /SUBSCRIPTION_REQUIRED/);
  }
  await db.query("update billing_test_accounts set lock_until=now()-interval '1 second' where user_id=$1",[a]);
  const newer = await call('billing_test_lock',[a]);
  await assert.rejects(sync([row]), /BUSY/);
  await call('billing_test_unlock',[a,lock.lock_token]);
  await sync([row],null,newer.lock_token);
  await db.query("update billing_test_accounts set synced_at=now()-interval '6 minutes' where user_id=$1",[a]);
  await assert.rejects(call('billing_test_use',[a,randomUUID(),'assistant']), /SYNC_REQUIRED/);
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from public.billing_test_accounts'), /permission denied/);
    await assert.rejects(call('billing_test_lock',[a]), /permission denied/);
    await db.exec('reset role');
  }
  console.log('Billing SQL: migration replay, leases, isolation, privileges, atomic quotas, renewals and cancellation passed.');
} finally { await db.close(); }
