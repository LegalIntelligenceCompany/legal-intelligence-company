"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Summary = {
  price?: { amount: number }; canManage?: boolean; canCheckout?: boolean; confirmed?: boolean;
  subscriptions: { id: string; status: string; periodEnd: string; cancelAtPeriodEnd: boolean; paid: boolean }[];
  entitlement: { eligible: boolean; periodEnd: string | null; limits: { assistant: number; analysis: number } };
  usage: { assistant: number; analysis: number };
};
const statuses: Record<string, string> = { active: "Activa", past_due: "Pagamento em atraso", unpaid: "Não paga", canceled: "Cancelada", incomplete: "Pagamento inicial pendente", incomplete_expired: "Pagamento inicial expirado", trialing: "Período experimental", paused: "Pausada" };
export function BillingPanel() {
  const [message, setMessage] = useState("A verificar a configuração…");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const [legacySession, setLegacySession] = useState("");
  const requestId = useRef<{ action: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const load = useCallback(async (signal?: AbortSignal, importId?: string) => {
    const session = importId || new URLSearchParams(window.location.search).get("session_id");
    try {
      const response = await fetch(`/api/billing${session ? `?session_id=${encodeURIComponent(session)}` : ""}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) { setLogin(response.status === 401); throw new Error(data.error || "Não foi possível verificar o estado."); }
      if (signal?.aborted) return;
      setLogin(false); setSummary(data);
      setMessage(data.confirmed ? "Pagamento simulado confirmado pela Stripe. A IA continua bloqueada." : "Estado actualizado. Todos os valores e limites nesta página são de teste.");
    } catch (error) { if (!signal?.aborted) { setSummary(null); setMessage(error instanceof Error ? error.message : "Não foi possível contactar o servidor."); } }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  async function action(name: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      if (requestId.current?.action !== name) requestId.current = { action: name, id: crypto.randomUUID() };
      const response = await fetch(`/api/billing?action=${name}`, { method: "POST", headers: { "x-checkout-request-id": requestId.current.id } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
      if (data.url) {
        const url = new URL(data.url);
        const host = name === "portal" ? "billing.stripe.com" : "checkout.stripe.com";
        if (url.protocol !== "https:" || url.hostname !== host) throw new Error("Destino inválido.");
        window.location.assign(url.href);
      } else {
        setSummary(previous => previous ? { ...previous, ...data } : previous);
        setMessage("Utilização simulada registada. Nenhuma pergunta foi enviada à IA.");
        requestId.current = null;
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir a operação."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="card team-panel">
    <h2>LIC — Plano de teste</h2>
    <p>Reservado à conta de teste. Não é uma oferta comercial, não cobra dinheiro real e não permite chamadas pagas à IA.</p>
    {summary?.price && <h3>{new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(summary.price.amount / 100)} / mês — valor simulado</h3>}
    <p role="status" aria-live="polite">{message}</p>
    <div className="workspace-toolbar">
      {login && <Link className="btn btn-primary" href="/login?next=/billing">Entrar para testar</Link>}
      {summary?.canCheckout && <button className="btn btn-primary" disabled={busy} onClick={() => action("checkout")}>Abrir checkout de teste</button>}
      {summary?.canManage && <button className="btn btn-primary" disabled={busy} onClick={() => action("portal")}>Gerir subscrição na Stripe</button>}
      <button className="btn btn-secondary" disabled={busy} onClick={() => void load()}>Actualizar estado</button>
      <Link className="btn btn-secondary" href="/setup/billing">Preparar pagamentos</Link>
      <Link className="btn btn-secondary" href="/setup/plans">Planos Individual e Empresas</Link>
    </div>
    {busy && <p>A comunicar com a Stripe…</p>}
    {summary?.subscriptions.map(s => <div className="workspace-row" key={s.id}>
      <h3>{statuses[s.status] || "Estado não reconhecido"}</h3>
      <p>{s.cancelAtPeriodEnd ? "Cancelamento agendado para" : "Fim do período"}: {new Date(s.periodEnd).toLocaleDateString("pt-PT")}. {s.paid ? "Pagamento confirmado." : "Sem acesso simulado pago."}</p>
      <small>{s.id}</small>
    </div>)}
    {summary && <div className="workspace-row">
      <h3>Limites provisórios — só simulação</h3>
      <p>Chat/ferramentas: {summary.usage.assistant} / {summary.entitlement.limits.assistant}. Análises: {summary.usage.analysis} / {summary.entitlement.limits.analysis} neste período.</p>
      <p>Os botões abaixo testam a contagem e o bloqueio por limite. Não fazem chamadas à IA. O período renova conforme a subscrição; não há acumulação de créditos.</p>
      <div className="workspace-toolbar">
        <button className="btn btn-secondary" disabled={busy || !summary.entitlement.eligible} onClick={() => action("simulate-assistant")}>Simular pedido de chat</button>
        <button className="btn btn-secondary" disabled={busy || !summary.entitlement.eligible} onClick={() => action("simulate-analysis")}>Simular análise</button>
      </div>
      {!summary.entitlement.eligible && <p>Sem subscrição activa paga neste período, a simulação está bloqueada.</p>}
    </div>}
    <details style={{ marginTop: 20 }}><summary>Recuperar um checkout de teste anterior</summary>
      <p>Se o pagamento foi feito antes desta actualização, use o identificador cs_test_ que aparece no endereço de regresso ao site. A pertença à sua conta é verificada na Stripe.</p>
      <label htmlFor="legacy-session">Identificador do checkout anterior</label>
      <input id="legacy-session" value={legacySession} onChange={e => setLegacySession(e.target.value.trim())} placeholder="cs_test_…" />
      <button className="btn btn-secondary" disabled={busy || !/^cs_test_[a-zA-Z0-9]+$/.test(legacySession)} onClick={() => void load(undefined, legacySession)}>Recuperar teste anterior</button>
    </details>
    <p>Cartão fictício: 4242 4242 4242 4242, validade futura e CVC de três dígitos. Nunca use um cartão verdadeiro. Para cancelar ou actualizar o cartão fictício, use Gerir subscrição.</p>
    <p>Antes de vender: aprovar preços e limites comerciais, implementar permissões de produção e confirmar faturação, impostos e condições do serviço. Não basta trocar as chaves.</p>
  </section>;
}
