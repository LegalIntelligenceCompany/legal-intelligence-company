import { NextResponse } from "next/server";
import { billingConfig } from "@/lib/billing";
import { billingAdmin, billingDBError, syncSubscriptions, withBillingLock } from "@/lib/billing-store";
import { billingEvents, readWebhookBody, verifyStripeEvent } from "@/lib/stripe-webhook";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  let event;
  try { billingConfig(); if (!process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) throw new Error(); }
  catch { return NextResponse.json({ error: "Not configured" }, { status: 503 }); }
  try { event = verifyStripeEvent(await readWebhookBody(request), request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET!); }
  catch { return NextResponse.json({ error: "Invalid event" }, { status: 400 }); }
  if (!billingEvents.has(event.type)) return NextResponse.json({ ignored: true });
  try {
    const admin = billingAdmin();
    const previous = await admin.from("billing_test_events").select("id").eq("id", event.id).maybeSingle(); billingDBError(previous.error);
    if (previous.data) return NextResponse.json({ duplicate: true });
    const customer = event.data.object.customer;
    if (typeof customer !== "string" || !/^cus_[A-Za-z0-9]+$/.test(customer)) return NextResponse.json({ ignored: true });
    const owner = await admin.from("billing_test_accounts").select("user_id").eq("customer_id", customer).maybeSingle(); billingDBError(owner.error);
    // Other Stripe products/customers aren't this app's accounts. Legacy checkout can be imported via its authenticated return URL.
    if (!owner.data) return NextResponse.json({ ignored: true });
    await withBillingLock(owner.data.user_id, async (db, account) => { await syncSubscriptions(db, account, event.id); });
    return NextResponse.json({ received: true });
  } catch {
    // Do not acknowledge failed persistence. Stripe retries delivery; don't log payloads/keys.
    return NextResponse.json({ error: "Retry later" }, { status: 503 });
  }
}
