import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billingConfig, describeTestPrice, isBillingTester, ownedTestSession, safeCheckoutURL, safePortalURL, stripeTestRequest } from "@/lib/billing";
import { bindCustomer, billingDBError, billingSummary, ensureCustomer, saveCheckout, syncSubscriptions, withBillingLock } from "@/lib/billing-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
const messages: Record<string, string> = {
  NOT_CONFIGURED: "Configure as chaves Stripe de teste, STRIPE_PRICE_ID e BILLING_TEST_EMAIL no servidor.",
  SETUP_REQUIRED: "Falta executar a actualização 006_billing.sql. Abra Preparar pagamentos nesta página.",
  UNAUTHORIZED: "Entre na sua conta para testar os pagamentos.",
  FORBIDDEN: "Esta página de teste está reservada à conta indicada pelo administrador.",
  PRICE: "Configure na Stripe um preço de teste activo, fixo, mensal e em euros.",
  INVALID: "Pedido inválido. Recarregue a página.",
  BUSY: "Existe uma operação em curso. Aguarde um minuto e actualize o estado antes de repetir.",
  CUSTOMER_CONFLICT: "Este checkout pertence a outro registo Stripe. Não foi alterada a associação da conta. Confirme os testes antigos no painel Stripe.",
  SUBSCRIPTION_EXISTS: "Já existe uma subscrição. Use Gerir subscrição para evitar uma segunda cobrança, mesmo simulada.",
  SUBSCRIPTION_REQUIRED: "É necessária uma subscrição de teste activa e paga para simular utilização.",
  QUOTA_EXCEEDED: "Atingiu o limite simulado deste período. Nenhuma chamada à IA foi feita.",
  SYNC_REQUIRED: "Actualize o estado da subscrição antes de continuar.",
  PROVIDER: "Não foi possível confirmar a operação. Confirme a configuração do portal e o painel Stripe antes de repetir.",
};
function failure(error: unknown) {
  const code = error instanceof Error && error.message in messages ? error.message : "PROVIDER";
  return NextResponse.json({ error: messages[code], code }, { headers, status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : code === "INVALID" ? 400 : code === "QUOTA_EXCEEDED" ? 429 : code === "SUBSCRIPTION_REQUIRED" ? 402 : ["BUSY", "SUBSCRIPTION_EXISTS", "CUSTOMER_CONFLICT"].includes(code) ? 409 : 503 });
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
    if (sessionId !== null && !/^cs_test_[a-zA-Z0-9]{1,240}$/.test(sessionId)) throw new Error("INVALID");
    const result = await withBillingLock(user.id, async (admin, account) => {
      let confirmed: boolean | undefined;
      if (sessionId) {
        const session = await stripeTestRequest(`checkout/sessions/${sessionId}?expand[]=subscription`);
        confirmed = ownedTestSession(session, user.id);
        if (typeof session.customer === "string") await bindCustomer(admin, account, session.customer);
      }
      const rows = await syncSubscriptions(admin, account);
      const summary = await billingSummary(admin, user.id, rows);
      return { ...summary, confirmed, canManage: !!account.customer_id, canCheckout: !rows.some(row => !["canceled", "incomplete_expired"].includes(row.status)) };
    });
    const price = describeTestPrice(await stripeTestRequest(`prices/${config.price}`));
    return NextResponse.json({ ...result, price, testOnly: true }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    if (request.headers.get("origin") !== origin) throw new Error("FORBIDDEN");
    const action = new URL(request.url).searchParams.get("action") || "checkout";
    if (!["checkout", "portal", "simulate-assistant", "simulate-analysis"].includes(action)) throw new Error("INVALID");
    const requestId = request.headers.get("x-checkout-request-id") || "";
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) throw new Error("INVALID");
    const { user, config } = await authenticate();
    const result = await withBillingLock(user.id, async (admin, account) => {
      const rows = await syncSubscriptions(admin, account);
      if (action.startsWith("simulate-")) {
        const used = await admin.rpc("billing_test_use", { p_actor: user.id, p_id: requestId, p_kind: action === "simulate-assistant" ? "assistant" : "analysis" });
        billingDBError(used.error);
        return { simulated: true, aiCalled: false, ...await billingSummary(admin, user.id, rows) };
      }
      if (action === "portal") {
        if (!account.customer_id) throw new Error("SUBSCRIPTION_REQUIRED");
        const portal = await stripeTestRequest("billing_portal/sessions", new URLSearchParams({ customer: account.customer_id, return_url: `${origin}/billing`, locale: "pt" }));
        return { url: safePortalURL(portal.url) };
      }
      if (rows.some(row => !["canceled", "incomplete_expired"].includes(row.status))) throw new Error("SUBSCRIPTION_EXISTS");
      describeTestPrice(await stripeTestRequest(`prices/${config.price}`));
      const customer = await ensureCustomer(admin, account);
      if (account.checkout_id) {
        const existing = await stripeTestRequest(`checkout/sessions/${account.checkout_id}`);
        if (existing.status === "open") return { url: safeCheckoutURL(existing.url) };
        if (existing.status === "complete" && !rows.length) throw new Error("BUSY");
        await saveCheckout(admin, account, null, true);
      }
      const body = new URLSearchParams({ mode: "subscription", customer, "line_items[0][price]": config.price,
        "line_items[0][quantity]": "1", "payment_method_types[0]": "card", locale: "pt",
        client_reference_id: user.id, "subscription_data[metadata][lic_user_id]": user.id,
        success_url: `${origin}/billing?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/billing?cancelled=1`,
        "custom_text[submit][message]": "Apenas teste. Não activa a IA nem uma subscrição comercial." });
      const session = await stripeTestRequest("checkout/sessions", body, `lic-test-${user.id}-${account.checkout_key}`);
      if (typeof session.id !== "string") throw new Error("PROVIDER");
      await saveCheckout(admin, account, session.id);
      return { url: safeCheckoutURL(session.url) };
    });
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
