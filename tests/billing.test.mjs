import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {pilotModule} from './pilot-helper.mjs';

const env = { STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_PRICE_ID: "price_test", BILLING_TEST_EMAIL: "tester@example.com" };
const price = { livemode: false, active: true, currency: "eur", unit_amount: 1000, billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1 } };
const session = { livemode: false, mode: "subscription", client_reference_id: "user1", status: "complete", payment_status: "paid", subscription: { status: "active", livemode: false } };
test('paid access requires explicitly enabled pilot and confirmed owner, never sandbox subscription',()=>{
 const enabled=load('../lib/billing-access.ts',{'./ai-pilot':{...pilotModule(true),PILOT_EXPIRES:'2099-01-01'}});
 for(const user of [null,{}, {email:'legalintelligencecompany@gmail.com'},{email:'other@example.com',email_confirmed_at:'yes'}])assert.equal(enabled.paidAIAccessError(user),'BILLING_TEST_ONLY');
 const owner={email:'legalintelligencecompany@gmail.com',email_confirmed_at:'yes'};
 assert.equal(enabled.paidAIAccessError(owner),'');
 assert.equal(load('../lib/billing-access.ts',{'./ai-pilot':pilotModule(false)}).paidAIAccessError(owner),'BILLING_TEST_ONLY');
 assert.equal(load('../lib/billing-access.ts',{'./ai-pilot':{...pilotModule(true),PILOT_EXPIRES:'2000-01-01'}}).paidAIAccessError(owner),'PILOT_EXPIRED');
});
function load(path, deps = {}, vars = env, fetcher = () => { throw new Error("Unexpected network"); }) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", "process", "fetch", source)(name => { if (!(name in deps)) throw new Error(name); return deps[name]; }, exports, { env: vars }, fetcher);
  return exports;
}
test("billing fails closed without test keys, price or permitted user", () => {
  for (const vars of [{}, { ...env, STRIPE_SECRET_KEY: "sk_live_fake" }, { ...env, BILLING_TEST_EMAIL: "" }, { ...env, STRIPE_PRICE_ID: "price_../../escape" }]) {
    assert.throws(() => load("../lib/billing.ts", {}, vars).billingConfig(), /NOT_CONFIGURED/);
  }
});
test("only the configured tester may access billing", () => {
  const b = load("../lib/billing.ts");
  assert.equal(b.isBillingTester("TESTER@example.com", env.BILLING_TEST_EMAIL), true);
  assert.equal(b.isBillingTester(undefined, env.BILLING_TEST_EMAIL), false);
  assert.equal(b.isBillingTester("other@example.com", env.BILLING_TEST_EMAIL), false);
});
test("price is active fixed monthly EUR, not client supplied", () => {
  const b = load("../lib/billing.ts");
  assert.equal(b.describeTestPrice(price).amount, 1000);
  for (const patch of [{ livemode: true }, { active: false }, { currency: "usd" }, { unit_amount: 0 }, { unit_amount: null }, { billing_scheme: "tiered" }, { recurring: null }, { recurring: { interval: "year", interval_count: 1 } }]) assert.throws(() => b.describeTestPrice({ ...price, ...patch }), /PRICE/);
});
test("confirmation requires ownership, test session and paid active subscription", () => {
  const b = load("../lib/billing.ts");
  assert.equal(b.ownedTestSession(session, "user1"), true);
  assert.throws(() => b.ownedTestSession(session, "user2"), /FORBIDDEN/);
  assert.throws(() => b.ownedTestSession({ ...session, livemode: true }, "user1"), /FORBIDDEN/);
  for (const patch of [{ status: "open" }, { payment_status: "unpaid" }, { subscription: null }, { subscription: { livemode: false, status: "past_due" } }]) assert.equal(b.ownedTestSession({ ...session, ...patch }, "user1"), false);
});
test("only HTTPS Stripe Checkout redirect is allowed", () => {
  const b = load("../lib/billing.ts");
  assert.equal(b.safeCheckoutURL("https://checkout.stripe.com/c/pay/test"), "https://checkout.stripe.com/c/pay/test");
  for (const url of ["https://checkout.stripe.com.evil.test", "javascript:alert(1)", "http://checkout.stripe.com", "https://user@checkout.stripe.com", "https://checkout.stripe.com:8443", null]) assert.throws(() => b.safeCheckoutURL(url));
});
test("Stripe fetch is bounded, server-authenticated and rejects live responses", async () => {
  let called;
  const b = load("../lib/billing.ts", {}, env, async (url, options) => { called = { url, options }; return Response.json(price); });
  await b.stripeTestRequest("prices/price_test");
  assert.equal(called.url, "https://api.stripe.com/v1/prices/price_test");
  assert.equal(called.options.headers.Authorization, "Bearer sk_test_fake");
  assert.equal(called.options.redirect, "error");
  assert.equal(called.options.cache, "no-store");
  const live = load("../lib/billing.ts", {}, env, async () => Response.json({ livemode: true }));
  await assert.rejects(live.stripeTestRequest("prices/price_test"), /NOT_TEST/);
});
function route(options = {}) {
  const calls = [];
  const b = load("../lib/billing.ts");
  const account = { user_id: "user1", customer_id: "cus_test", checkout_key: "stable-db-key", checkout_id: options.checkoutId || null, lock_token: "token" };
  const store = {
    withBillingLock: async (actor, work) => { assert.equal(actor, "user1"); if (options.busy) throw new Error("BUSY"); return work({ rpc: async (name, args) => { calls.push([name, args]); return { data: {}, error: options.quota ? { message: "QUOTA_EXCEEDED" } : null }; } }, account); },
    syncSubscriptions: async () => options.rows || [],
    billingSummary: async () => ({ usage: { assistant: 0, analysis: 0 } }),
    ensureCustomer: async () => "cus_test",
    saveCheckout: async () => {},
    bindCustomer: async () => {},
    billingDBError: error => { if (error) throw new Error(error.message); },
  };
  const api = load("../app/api/billing/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: "user1", email: options.email || "tester@example.com" } }, error: null }) } }) },
    "@/lib/billing-store": store,
    "@/lib/billing": { ...b, stripeTestRequest: async (...args) => { calls.push(args); if (options.failure) throw new Error("secret must not leak"); return args[0].startsWith("prices/") ? price : args[0] === "billing_portal/sessions" ? { url: "https://billing.stripe.com/p/session/test" } : options.session || { ...session, id: "cs_test_abc", url: "https://checkout.stripe.com/c/pay/test" }; } },
  });
  return { ...api, calls };
}
const id = "a1234567-1234-4123-8123-123456789abc";
function post(origin = "https://example.com", requestId = id) { return new Request("https://example.com/api/billing", { method: "POST", headers: { origin, "x-checkout-request-id": requestId }, body: '{"price":"evil","user":"other"}' }); }
test("checkout blocks CSRF, unauthenticated and non-tester requests without Stripe calls", async () => {
  for (const [options, req, status] of [[{}, post("https://evil.test"), 403], [{ noUser: true }, post(), 401], [{ email: "other@example.com" }, post(), 403], [{}, post("https://example.com", "bad"), 400]]) {
    const api = route(options); assert.equal((await api.POST(req)).status, status); assert.equal(api.calls.length, 0);
  }
});
test("checkout binds price and user on server and reuses idempotency key", async () => {
  const api = route();
  assert.equal((await api.POST(post())).status, 200);
  await api.POST(post());
  const [, body, key] = api.calls[1];
  assert.equal(body.get("line_items[0][price]"), env.STRIPE_PRICE_ID);
  assert.equal(body.get("client_reference_id"), "user1");
  assert.equal(body.get("mode"), "subscription");
  assert.equal(body.get("success_url"), "https://example.com/billing?session_id={CHECKOUT_SESSION_ID}");
  assert.equal(key, api.calls[3][2]);
});
test("confirmation API hides other users' sessions and rejects fake/live ids", async () => {
  const api = route({ session: { ...session, client_reference_id: "other" } });
  assert.equal((await api.GET(new Request("https://example.com/api/billing?session_id=cs_test_abc"))).status, 403);
  const invalid = route();
  assert.equal((await invalid.GET(new Request("https://example.com/api/billing?session_id=cs_live_abc"))).status, 400);
  assert.equal(invalid.calls.length, 0);
  const valid = route();
  const response = await valid.GET(new Request("https://example.com/api/billing?session_id=cs_test_abc"));
  assert.equal((await response.json()).confirmed, true);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("provider failures never expose credentials or raw messages", async () => {
  const api = route({ failure: true }); const response = await api.POST(post());
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret must not leak|sk_test/);
});
test("active, delinquent and pending subscriptions block duplicate checkout", async () => {
  for (const status of ["active", "past_due", "unpaid", "incomplete", "trialing", "paused"]) {
    const api = route({ rows: [{ status }] });
    assert.equal((await api.POST(post())).status, 409); assert.equal(api.calls.length, 0);
  }
});
test("existing open checkout is reused; a terminal subscription permits replacement", async () => {
  const api = route({ checkoutId: "cs_test_old", session: { ...session, status: "open", url: "https://checkout.stripe.com/c/pay/old" } });
  const res = await api.POST(post()); assert.equal(res.status, 200);
  assert.equal((await res.json()).url, "https://checkout.stripe.com/c/pay/old");
  assert.ok(!api.calls.some(([path]) => path === "checkout/sessions"));
  assert.equal((await route({ rows: [{ status: "canceled" }] }).POST(post())).status, 200);
});
test("portal uses only server-bound customer and trusted return URL", async () => {
  const api = route();
  const req = new Request("https://example.com/api/billing?action=portal", { method: "POST", headers: { origin: "https://example.com", "x-checkout-request-id": id }, body: '{"customer":"cus_victim"}' });
  assert.equal((await api.POST(req)).status, 200);
  assert.equal(api.calls[0][1].get("customer"), "cus_test");
  assert.equal(api.calls[0][1].get("return_url"), "https://example.com/billing");
});
test("quota simulation passes identity to atomic RPC and exposes a safe limit error", async () => {
  const api = route({ quota: true });
  const res = await api.POST(new Request("https://example.com/api/billing?action=simulate-assistant", { method: "POST", headers: { origin: "https://example.com", "x-checkout-request-id": id } }));
  assert.equal(res.status, 429); assert.equal(api.calls[0][0], "billing_test_use");
  assert.equal(api.calls[0][1].p_actor, "user1");
});
test("subscription policy blocks unsupported prices, unpaid invoices, pauses and expired periods", () => {
  const b = load("../lib/billing.ts");
  const now = Math.floor(Date.now()/1000);
  const raw = { id: "sub_test", customer: "cus_test", livemode: false, status: "active", current_period_start: now-60, current_period_end: now+3600,
    items: { data: [{ quantity: 1, price: { id: "price_test" } }] }, latest_invoice: { livemode: false, customer: "cus_test", subscription: "sub_test", status: "paid", amount_paid: 1000 } };
  const snapshot = b.subscriptionSnapshot(raw, "cus_test", "price_test");
  assert.equal(b.testEntitlement([snapshot]).eligible, true);
  assert.equal(b.testEntitlement([snapshot]).aiEnabled, false);
  assert.equal(b.testEntitlement([{ ...snapshot, cancel_at_period_end: true }]).eligible, true);
  for (const patch of [{ status: "past_due" }, { status: "canceled" }, { latest_invoice: { ...raw.latest_invoice, status: "open" } }, { latest_invoice: { ...raw.latest_invoice, customer: "cus_wrong" } }, { pause_collection: { behavior: "void" } }, { items: { data: [{ quantity: 1, price: { id: "price_wrong" } }] } }]) {
    assert.equal(b.testEntitlement([b.subscriptionSnapshot({ ...raw, ...patch }, "cus_test", "price_test")]).eligible, false);
  }
  assert.equal(b.testEntitlement([{ ...snapshot, period_end: new Date(0).toISOString() }]).eligible, false);
  assert.throws(() => b.subscriptionSnapshot({ ...raw, livemode: true }, "cus_test", "price_test"));
  assert.throws(() => b.subscriptionSnapshot(raw, "cus_wrong", "price_test"));
  assert.equal(load("../lib/billing-access.ts",{'./ai-pilot':pilotModule()}).paidAIAccessError(), "BILLING_TEST_ONLY");
});
