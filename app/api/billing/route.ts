import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billingConfig, describeTestPrice, isBillingTester, ownedTestSession, safeCheckoutURL, stripeTestRequest } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const messages: Record<string, string> = {
  NOT_CONFIGURED: "O teste requer STRIPE_SECRET_KEY (sk_test_), STRIPE_PRICE_ID e BILLING_TEST_EMAIL no servidor.",
  UNAUTHORIZED: "Entre na sua conta para testar os pagamentos.",
  FORBIDDEN: "Esta página de teste está reservada à conta indicada pelo administrador.",
  PRICE: "Configure na Stripe um preço de teste activo, fixo, mensal e em euros.",
  INVALID: "Pedido inválido. Recarregue a página.",
  PROVIDER: "Não foi possível confirmar a operação com a Stripe. Verifique o painel de teste antes de repetir.",
};
function failure(error: unknown) {
  const code = error instanceof Error && error.message in messages ? error.message : "PROVIDER";
  return NextResponse.json({ error: messages[code], code }, { headers, status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : code === "INVALID" ? 400 : 503 });
}
async function authenticate() {
  const client = await createClient(true);
  if (!client) throw new Error("NOT_CONFIGURED");
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  const config = billingConfig();
  if (!isBillingTester(data.user.email, config.tester)) throw new Error("FORBIDDEN");
  return { user: data.user, config };
}
export async function GET(request: Request) {
  try {
    const { user, config } = await authenticate();
    const sessionId = new URL(request.url).searchParams.get("session_id");
    if (sessionId !== null) {
      if (!/^cs_test_[a-zA-Z0-9]{1,240}$/.test(sessionId)) throw new Error("INVALID");
      const session = await stripeTestRequest(`checkout/sessions/${sessionId}?expand[]=subscription`);
      return NextResponse.json({ confirmed: ownedTestSession(session, user.id), testOnly: true }, { headers });
    }
    const price = await stripeTestRequest(`prices/${config.price}`);
    return NextResponse.json({ price: describeTestPrice(price), testOnly: true }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    if (request.headers.get("origin") !== origin) throw new Error("FORBIDDEN");
    const requestId = request.headers.get("x-checkout-request-id") || "";
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) throw new Error("INVALID");
    const { user, config } = await authenticate();
    describeTestPrice(await stripeTestRequest(`prices/${config.price}`));
    // Ignore client bodies: user, price, quantity and destinations are server-controlled.
    const body = new URLSearchParams({ mode: "subscription", "line_items[0][price]": config.price,
      "line_items[0][quantity]": "1", "payment_method_types[0]": "card", locale: "pt",
      client_reference_id: user.id, "subscription_data[metadata][lic_user_id]": user.id,
      success_url: `${origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?cancelled=1`,
      "custom_text[submit][message]": "Apenas teste. Não activa a IA nem uma subscrição comercial." });
    const session = await stripeTestRequest("checkout/sessions", body, `lic-test-${user.id}-${requestId}`);
    return NextResponse.json({ url: safeCheckoutURL(session.url) }, { headers });
  } catch (error) { return failure(error); }
}
