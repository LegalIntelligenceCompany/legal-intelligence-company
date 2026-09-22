'use client';
import { useRef, useState } from 'react';
import { commercialPlans } from '@/lib/commercial-plans';
export function CommercialPlansPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Planos definidos. Consulte o estado para verificar se já existem na Stripe de teste.');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const pending = useRef(false);
  async function run(create: boolean) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const response = await fetch('/api/billing/plans', { method: create ? 'POST' : 'GET', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Não foi possível verificar os planos.');
      setPrices(Object.fromEntries(data.plans.map((p: { id: string; stripe: { priceId: string } | null }) => [p.id, p.stripe?.priceId || ''])));
      setMessage(data.plans.every((p: { stripe: unknown }) => p.stripe) ? 'Os dois preços foram confirmados na Stripe de teste. Nenhum cliente foi cobrado e o acesso pago à IA continua desligado.' : 'Ainda faltam preços de teste. Pode criá-los com o botão abaixo.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de ligação. Consulte o estado antes de repetir.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <>
    <div className="lic-plans-grid">{commercialPlans.map(plan => <section className="card team-panel" key={plan.id}>
      <div className="eyebrow">{plan.scope === 'organization' ? 'Equipa e empresa' : 'Uso individual'}</div>
      <h2>{plan.name}</h2><p className="lic-plan-price">{plan.monthlyCents / 100} €<small> / mês</small></p>
      <p>Preço base. Acresce IVA quando aplicável.</p>
      <p>{plan.seats === 1 ? '1 utilizador, com saldo individual.' : '3 utilizadores incluídos, com um único saldo partilhado pela empresa. 99 € pela empresa, não por utilizador.'}</p>
      <p>Créditos incluídos e carregamentos adicionais previstos. A quantidade, validade e tabela de consumo ainda não estão publicadas nem activas.</p>
      <p><strong>Pré-lançamento — subscrição indisponível.</strong></p>
      {prices[plan.id] && <p>Preço de teste confirmado: <code>{prices[plan.id]}</code></p>}
    </section>)}</div>
    <section className="card team-panel"><h2>Preparação segura dos planos</h2>
      <p>Cria apenas produtos e preços em modo de teste. Não altera o plano antigo, não cria subscrições, não activa impostos automáticos e não concede créditos ou acesso à IA.</p>
      <div className="workspace-toolbar"><button className="btn btn-primary" disabled={busy} onClick={() => run(true)}>Criar planos na Stripe de teste</button><button className="btn btn-secondary" disabled={busy} onClick={() => run(false)}>Consultar estado dos planos</button></div>
      <p role="status" aria-live="polite">{busy ? 'A confirmar os planos na Stripe…' : message}</p>
      <h3>Antes de aceitar clientes</h3><ul><li>Validar créditos, reservas de custo e bloqueio sem saldo.</li><li>Validar três lugares e saldo partilhado sem ultrapassagens simultâneas.</li><li>Configurar impostos e apresentar o total aplicável antes da compra.</li><li>Testar pagamento, renovação, cancelamento e reembolso antes de activar produção.</li></ul>
    </section>
  </>;
}
