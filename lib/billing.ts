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
  if (!data || (data.object === "list" ? !Array.isArray(data.data) || data.data.some((item: { livemode?: boolean }) => item.livemode !== false) : data.livemode !== false)) throw new Error("NOT_TEST");
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

export function safePortalURL(value: unknown) {
  if (typeof value !== "string") throw new Error("PROVIDER");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com" || url.username || url.password || url.port) throw new Error("PROVIDER");
  return url.href;
}

export type BillingSnapshot = { id: string; price_id: string; status: string; period_start: string; period_end: string; cancel_at_period_end: boolean; paid: boolean };
export function subscriptionSnapshot(raw: Record<string, unknown>, customer: string, price: string): BillingSnapshot {
  if (raw.livemode !== false || raw.customer !== customer || typeof raw.id !== "string" || !/^sub_[A-Za-z0-9]+$/.test(raw.id)) throw new Error("PROVIDER");
  const items = raw.items as { data?: { price?: { id?: string }; quantity?: number; current_period_start?: number; current_period_end?: number }[] };
  const item = items?.data?.[0];
  const invoice = raw.latest_invoice as { status?: string; livemode?: boolean; amount_paid?: number; customer?: string; subscription?: string } | null;
  const start = Number(raw.current_period_start ?? item?.current_period_start ?? raw.created);
  const end = Number(raw.current_period_end ?? item?.current_period_end ?? raw.created);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end < start) throw new Error("PROVIDER");
  const matches = items?.data?.length === 1 && item?.price?.id === price && item?.quantity === 1;
  return { id: raw.id, price_id: item?.price?.id || "unknown", status: String(raw.status),
    period_start: new Date(start * 1000).toISOString(), period_end: new Date(end * 1000).toISOString(),
    cancel_at_period_end: raw.cancel_at_period_end === true,
    paid: matches && raw.status === "active" && !raw.pause_collection && invoice?.livemode === false &&
      invoice.customer === customer && invoice.subscription === raw.id && invoice.status === "paid" && Number(invoice.amount_paid) > 0 };
}

export function testEntitlement(rows: BillingSnapshot[], now = Date.now()) {
  const active = rows.filter(row => row.status === "active" && row.paid && Date.parse(row.period_start) <= now && Date.parse(row.period_end) > now)
    .sort((a, b) => Date.parse(b.period_end) - Date.parse(a.period_end))[0];
  return { eligible: !!active, periodStart: active?.period_start ?? null, periodEnd: active?.period_end ?? null,
    limits: { assistant: 20, analysis: 5 }, aiEnabled: false as const, testOnly: true as const };
}
