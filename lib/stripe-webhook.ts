import { createHmac, timingSafeEqual } from "node:crypto";

// Stripe v1: HMAC-SHA256 over timestamp + '.' + the untouched request bytes.
// All v1 signatures are accepted for secret rotation; timestamp tolerance is bounded.
export function verifyStripeEvent(body: string, header: string | null, secret: string, now = Date.now()) {
  if (!secret.startsWith("whsec_") || !header || header.length > 4096) throw new Error("SIGNATURE");
  const parts = header.split(",").map(part => part.trim().split("="));
  const timestamps = parts.filter(([key]) => key === "t");
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0][1])) throw new Error("SIGNATURE");
  const timestamp = Number(timestamps[0][1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300) throw new Error("SIGNATURE");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest();
  const valid = parts.some(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/i.test(value || "") && timingSafeEqual(expected, Buffer.from(value, "hex")));
  if (!valid) throw new Error("SIGNATURE");
  const event = JSON.parse(body);
  if (!/^evt_[a-zA-Z0-9]+$/.test(event?.id) || event.livemode !== false || typeof event.type !== "string" || !event.data?.object) throw new Error("EVENT");
  return event as { id: string; type: string; livemode: false; data: { object: Record<string, unknown> } };
}
export const billingEvents = new Set(["checkout.session.completed", "checkout.session.expired", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"]);

export async function readWebhookBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error("BODY");
  const parts: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 1024 * 1024) { await reader.cancel(); throw new Error("BODY"); } parts.push(value); }
    return Buffer.concat(parts).toString("utf8");
  } finally { reader.releaseLock(); }
}
