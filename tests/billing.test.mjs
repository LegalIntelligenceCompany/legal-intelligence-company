import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const env = { STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_PRICE_ID: "price_test", BILLING_TEST_EMAIL: "tester@example.com" };
const price = { livemode: false, active: true, currency: "eur", unit_amount: 1000, billing_scheme: "per_unit", recurring: { interval: "month", interval_count: 1 } };
const session = { livemode: false, mode: "subscription", client_reference_id: "user1", status: "complete", payment_status: "paid", subscription: { status: "active", livemode: false } };
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
  const api = load("../app/api/billing/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: "user1", email: options.email || "tester@example.com" } }, error: null }) } }) },
    "@/lib/billing": { ...b, stripeTestRequest: async (...args) => { calls.push(args); if (options.failure) throw new Error("secret must not leak"); return args[0].startsWith("prices/") ? price : options.session || { ...session, url: "https://checkout.stripe.com/c/pay/test" }; } },
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
