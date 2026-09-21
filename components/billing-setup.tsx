"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
export function BillingSetup({ sql }: { sql: string }) {
  const [message, setMessage] = useState("");
  return <AppShell><h1>Preparar subscrições de teste</h1><section className="card team-panel">
    <h2>1. Guardar os registos no Supabase</h2><p>A actualização 006 cria tabelas privadas para subscrições, notificações e contadores simulados. Não apaga contratos, não faz pagamentos e não activa a IA.</p>
    <button className="btn btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(sql); setMessage("Código copiado. Cole numa nova consulta no SQL Editor do Supabase e clique em Run."); } catch { setMessage("Seleccione o código abaixo e copie com ⌘ + C."); } }}>Copiar código SQL</button><p role="status">{message}</p>
    <details><summary>Ver código completo</summary><textarea aria-label="006_billing.sql" readOnly rows={18} value={sql} onFocus={e => e.target.select()} /></details>
    <h2>2. Receber notificações da Stripe</h2>
    <p>Na mesma área de teste da Stripe onde criou o preço, abra Desenvolvedores / Workbench → Webhooks → Adicionar destino. Escolha eventos da sua conta e um endpoint de webhook.</p>
    <p>Endereço: <code>https://legal-intelligence-company.vercel.app/api/billing/webhook</code></p>
    <p>Seleccione estes eventos:</p><pre style={{ whiteSpace: "pre-wrap" }}>checkout.session.completed{"\n"}checkout.session.expired{"\n"}customer.subscription.created{"\n"}customer.subscription.updated{"\n"}customer.subscription.deleted{"\n"}customer.subscription.paused{"\n"}customer.subscription.resumed{"\n"}invoice.paid{"\n"}invoice.payment_failed{"\n"}invoice.payment_action_required</pre>
    <p>Copie o segredo de assinatura desse destino (começa por whsec_) directamente para a variável STRIPE_WEBHOOK_SECRET na Vercel, em Production e Preview. Não o partilhe no chat. Publique novamente (Redeploy).</p>
    <h2>3. Portal do cliente</h2>
    <p>Na Stripe, ainda em teste, abra Definições → Billing → Portal do cliente. Active actualização de métodos de pagamento e cancelamento da subscrição no fim do período. Desactive mudanças de plano e de quantidade nesta fase. Guarde a configuração.</p>
    <h2>4. Verificação</h2>
    <p>Volte a Pagamentos, actualize o estado, simule utilização e abra Gerir subscrição. Agende o cancelamento, regresse e confirme a data. Na Stripe, confirme que o webhook responde com sucesso. Uma falha de pagamento deve bloquear a elegibilidade simulada; a renovação paga deve iniciar um novo período.</p>
    <p>As variáveis STRIPE_SECRET_KEY, STRIPE_PRICE_ID e BILLING_TEST_EMAIL já configuradas mantêm-se. Use sempre a mesma sandbox. AI_EXECUTION_ENABLED deve continuar false. Mesmo se for activado por engano, esta versão bloqueia a IA paga.</p>
    <Link className="btn btn-primary" href="/billing">Abrir pagamentos</Link>
  </section></AppShell>;
}
