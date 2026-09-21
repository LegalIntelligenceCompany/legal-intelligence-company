import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(path, deps, env = {}) {
  const src = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function("require", "exports", "process", src)(name => { if (!(name in deps)) throw new Error(name); return deps[name]; }, exports, { env }); return exports;
}
const wh = load("../lib/stripe-webhook.ts", { "node:crypto": crypto });
const secret = "whsec_fake";
function body(patch = {}) { return JSON.stringify({ id: "evt_test", type: "invoice.paid", livemode: false, data: { object: { customer: "cus_test" } }, ...patch }); }
function sign(raw, t = Math.floor(Date.now()/1000)) { return `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`; }
test("webhook signature validates raw bytes and rejects tampering, stale/future/live/invalid payloads", () => {
  const raw = body(); assert.equal(wh.verifyStripeEvent(raw, sign(raw), secret).id, "evt_test");
  assert.equal(wh.verifyStripeEvent(raw, sign(raw)+",v1="+"0".repeat(64), secret).id, "evt_test");
  for (const header of [null, "t=1,v1=abc", sign(raw, 1), sign(raw, Math.floor(Date.now()/1000)+600), sign(raw)+",t=1", sign(raw).replace(/.$/, "x")]) assert.throws(() => wh.verifyStripeEvent(raw, header, secret));
  assert.throws(() => wh.verifyStripeEvent(raw+" ", sign(raw), secret));
  assert.throws(() => wh.verifyStripeEvent(raw, sign(raw), "whsec_other"));
  const live = body({ livemode: true }); assert.throws(() => wh.verifyStripeEvent(live, sign(live), secret));
});
test("webhook body is bounded and cannot trigger work with oversized input", async () => {
  await assert.rejects(wh.readWebhookBody(new Request("https://example.com", { method: "POST", body: "x".repeat(1024*1024+1) })), /BODY/);
});
function route(options = {}) {
  const calls = [];
  const admin = { from(table) { const q = { select() { return q; }, eq() { return q; }, async maybeSingle() { return { error: options.dbError ? { message: "secret" } : null, data: table === "billing_test_events" ? options.duplicate ? { id: "evt_test" } : null : options.unknown ? null : { user_id: "owner" } }; } }; return q; } };
  const api = load("../app/api/billing/webhook/route.ts", {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@/lib/billing": { billingConfig() {} },
    "@/lib/stripe-webhook": wh,
    "@/lib/billing-store": { billingAdmin: () => admin, billingDBError: error => { if (error) throw new Error(); }, withBillingLock: async (actor, work) => { calls.push(actor); return work(admin, {}); }, syncSubscriptions: async (...args) => { if (options.failSync) throw new Error(); calls.push(args[2]); } },
  }, { STRIPE_WEBHOOK_SECRET: secret });
  return { calls, post: (raw = body(), header = sign(raw)) => api.POST(new Request("https://example.com/api/billing/webhook", { method: "POST", headers: { "stripe-signature": header }, body: raw })) };
}
test("webhook rejects before database, deduplicates events and retries failed persistence", async () => {
  let r = route(); assert.equal((await r.post(body(), "bad")).status, 400); assert.equal(r.calls.length, 0);
  r = route({ duplicate: true }); assert.equal((await r.post()).status, 200); assert.equal(r.calls.length, 0);
  r = route({ failSync: true }); assert.equal((await r.post()).status, 503);
  r = route({ dbError: true }); assert.equal((await r.post()).status, 503);
  r = route(); assert.equal((await r.post()).status, 200); assert.deepEqual(r.calls, ["owner", "evt_test"]);
  r = route({ unknown: true }); assert.equal((await r.post()).status, 200); assert.equal(r.calls.length, 0);
});
