// Server-side, test-only Stripe integration. Never enables AI or paid entitlements.
export function billingConfig() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  const price = process.env.STRIPE_PRICE_ID || "";
  const tester = (process.env.BILLING_TEST_EMAIL || "").trim().toLowerCase();
  if (!key.startsWith("sk_test_") || !/^price_[a-zA-Z0-9]+$/.test(price) || !tester) throw new Error("NOT_CONFIGURED");
  return { key, price, tester };
}

export function isBillingTester(email: string | undefined, tester: string) {
  return !!email && email.toLowerCase() === tester;
}

export async function stripeTestRequest(path: string, body?: URLSearchParams, idempotency?: string): Promise<Record<string, unknown>> {
  const { key } = billingConfig();
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2025-02-24.acacia",
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotency ? { "Idempotency-Key": idempotency } : {}) },
    ...(body ? { body: body.toString() } : {}), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("PROVIDER");
  const data = await response.json();
  if (!data || data.livemode !== false) throw new Error("NOT_TEST");
  return data;
}

export function describeTestPrice(price: Record<string, unknown>) {
  const recurring = price.recurring as { interval?: string; interval_count?: number } | null;
  if (price.active !== true || price.livemode !== false || price.currency !== "eur" ||
      typeof price.unit_amount !== "number" || !Number.isSafeInteger(price.unit_amount) || price.unit_amount <= 0 ||
      price.billing_scheme !== "per_unit" || recurring?.interval !== "month" || recurring.interval_count !== 1) throw new Error("PRICE");
  return { amount: price.unit_amount, currency: "EUR", interval: "mês" };
}

export function ownedTestSession(session: Record<string, unknown>, userId: string) {
  if (session.livemode !== false || session.mode !== "subscription" || session.client_reference_id !== userId) throw new Error("FORBIDDEN");
  const subscription = session.subscription as { status?: string; livemode?: boolean } | null;
  return session.status === "complete" && session.payment_status === "paid" &&
    subscription?.livemode === false && subscription.status === "active";
}

export function safeCheckoutURL(value: unknown) {
  if (typeof value !== "string") throw new Error("PROVIDER");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password || url.port) throw new Error("PROVIDER");
  return url.href;
}
