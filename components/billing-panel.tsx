"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function BillingPanel() {
  const [message, setMessage] = useState("A verificar a configuração…");
  const [price, setPrice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session_id");
    fetch(`/api/billing${session ? `?session_id=${encodeURIComponent(session)}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) { setLogin(response.status === 401); throw new Error(data.error || "Não foi possível verificar o teste."); }
        if (session) {
          setMessage(data.confirmed ? "Pagamento simulado confirmado pela Stripe. Não houve cobrança real nem activação da IA." : "A Stripe ainda não confirmou um pagamento simulado concluído. Verifique o painel antes de repetir.");
        } else {
          setPrice(data.price.amount);
          setMessage(params.has("cancelled") ? "Regressou do checkout. Consulte o painel da Stripe antes de iniciar outro teste." : "Pronto para simular uma subscrição. Não use um cartão verdadeiro.");
        }
      }).catch(error => { if (!controller.signal.aborted) setMessage(error.message || "Não foi possível contactar o servidor."); });
    return () => controller.abort();
  }, []);
  async function checkout() {
    if (busy) return;
    setBusy(true);
    try {
      requestId.current ||= crypto.randomUUID();
      const response = await fetch("/api/billing", { method: "POST", headers: { "x-checkout-request-id": requestId.current } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível abrir o checkout.");
      const url = new URL(data.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Destino de pagamento inválido.");
      window.location.assign(url.href);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao iniciar o teste."); setBusy(false); }
  }
  return <section className="card team-panel">
    <h2>LIC — Plano de teste</h2>
    <p>Ambiente de simulação, reservado ao administrador. Não é uma oferta comercial e não disponibiliza utilização da IA.</p>
    {price !== null && <h3>{new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(price / 100)} / mês — valor simulado</h3>}
    <p role="status" aria-live="polite">{message}</p>
    <div className="workspace-toolbar">
      {login ? <Link className="btn btn-primary" href="/login?next=/billing">Entrar para testar</Link> : price !== null && <button className="btn btn-primary" disabled={busy} onClick={checkout}>{busy ? "A abrir a Stripe…" : "Abrir checkout de teste"}</button>}
      <Link className="btn btn-secondary" href="/settings">Voltar às definições</Link>
    </div>
    <p>Cartão de teste: 4242 4242 4242 4242; validade futura e CVC de três dígitos. Use apenas dados fictícios. A confirmação é consultada no servidor, não inferida do endereço de retorno.</p>
    <p>Antes do lançamento: configurar notificações de pagamentos, renovação e cancelamento, limites por plano, faturação e impostos. Os pagamentos reais estão bloqueados nesta implementação.</p>
  </section>;
}
