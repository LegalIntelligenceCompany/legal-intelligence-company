import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingConfig, stripeTestRequest, subscriptionSnapshot, testEntitlement, type BillingSnapshot } from "@/lib/billing";

export type BillingAccount = { user_id: string; customer_id: string | null; checkout_key: string; checkout_id: string | null; lock_token: string; synced_at: string | null };
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export function billingAdmin() { const admin = createAdminClient(); if (!admin) throw new Error("NOT_CONFIGURED"); return admin; }
export function billingDBError(error: { message?: string } | null) {
  if (!error) return;
  const code = ["BUSY", "CUSTOMER_CONFLICT", "SUBSCRIPTION_REQUIRED", "QUOTA_EXCEEDED", "SYNC_REQUIRED"].find(c => error.message?.includes(c));
  throw new Error(code || "SETUP_REQUIRED");
}
export async function withBillingLock<T>(actor: string, work: (admin: Admin, account: BillingAccount) => Promise<T>): Promise<T> {
  const admin = billingAdmin();
  const lock = await admin.rpc("billing_test_lock", { p_actor: actor }); billingDBError(lock.error);
  const account = lock.data as BillingAccount;
  try { return await work(admin, account); }
  finally { await admin.rpc("billing_test_unlock", { p_actor: actor, p_token: account.lock_token }); }
}
export async function bindCustomer(admin: Admin, account: BillingAccount, customer: string) {
  if (!/^cus_[A-Za-z0-9]+$/.test(customer)) throw new Error("PROVIDER");
  const result = await admin.rpc("billing_test_bind", { p_actor: account.user_id, p_token: account.lock_token, p_customer: customer });
  billingDBError(result.error); account.customer_id = customer;
}
export async function ensureCustomer(admin: Admin, account: BillingAccount) {
  if (account.customer_id) return account.customer_id;
  const customer = await stripeTestRequest("customers", new URLSearchParams({ "metadata[lic_user_id]": account.user_id }), `lic-customer-${account.user_id}`);
  if (typeof customer.id !== "string") throw new Error("PROVIDER");
  await bindCustomer(admin, account, customer.id); return customer.id;
}
export async function saveCheckout(admin: Admin, account: BillingAccount, session: string | null, rotate = false) {
  const result = await admin.rpc("billing_test_checkout", { p_actor: account.user_id, p_token: account.lock_token, p_session: session, p_rotate: rotate });
  billingDBError(result.error); account.checkout_key = result.data as string; account.checkout_id = session;
}
export async function syncSubscriptions(admin: Admin, account: BillingAccount, event: string | null = null): Promise<BillingSnapshot[]> {
  let rows: BillingSnapshot[] = [];
  if (account.customer_id) {
    const list = await stripeTestRequest(`subscriptions?customer=${account.customer_id}&status=all&limit=100&expand[]=data.latest_invoice`);
    if (list.has_more !== false || !Array.isArray(list.data)) throw new Error("PROVIDER");
    rows = list.data.map(raw => subscriptionSnapshot(raw, account.customer_id!, billingConfig().price));
  }
  const result = await admin.rpc("billing_test_sync", { p_actor: account.user_id, p_token: account.lock_token, p_rows: rows, p_event: event });
  billingDBError(result.error); return rows;
}
export async function billingSummary(admin: Admin, actor: string, rows: BillingSnapshot[]) {
  const entitlement = testEntitlement(rows);
  const counts = { assistant: 0, analysis: 0 };
  if (entitlement.periodStart) {
    for (const kind of ["assistant", "analysis"] as const) {
      const result = await admin.from("billing_test_usage").select("id", { count: "exact", head: true }).eq("user_id", actor).eq("kind", kind).gte("created_at", entitlement.periodStart);
      billingDBError(result.error); counts[kind] = result.count || 0;
    }
  }
  return { subscriptions: rows.map(({ id, status, period_end, cancel_at_period_end, paid }) => ({ id, status, periodEnd: period_end, cancelAtPeriodEnd: cancel_at_period_end, paid })), entitlement, usage: counts };
}
