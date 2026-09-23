'use client';
import {useState} from 'react';
import {simulateProviderCost,type ReferenceExchange} from '@/lib/tariff-preparation';
export function TariffSimulator({exchange}:{exchange:ReferenceExchange}){
 const [cost,setCost]=useState('0,10');
 let result:ReturnType<typeof simulateProviderCost>|null=null;
 try{result=simulateProviderCost(cost,exchange);}catch{/* Invalid input must not show a stale estimate. */}
 const money=(value:number)=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:4}).format(value);
 return <section className="card team-panel"><h2>Simular a regra de 3× — sem gastar créditos</h2>
  <p>Introduza o custo total hipotético do fornecedor, incluindo todos os modelos e ferramentas do pedido. Isto não envia perguntas à IA e não altera carteiras.</p>
  <label>Custo agregado do fornecedor (USD)<input inputMode="decimal" value={cost} onChange={event=>setCost(event.target.value)} aria-invalid={!result}/></label>
  <div aria-live="polite">{result?<><p>Custo convertido de referência: {money(result.providerEuro)}.</p><p>Débito simulado ao cliente, antes de IVA: <strong>{money(result.customerCents/100)}</strong>.</p><p>Diferença bruta: {money(result.customerCents/100-result.providerEuro)}. Não é lucro líquido: faltam comissões, impostos, reembolsos, câmbio efectivo e outros custos.</p></>:<p role="alert">Introduza um valor positivo ou zero, com até seis casas decimais.</p>}</div>
  <p>Câmbio informativo BCE de {exchange.date}: 1 EUR = {exchange.usdPerEuro} USD. Arredondamento por excesso ao cêntimo apenas no débito final. Este câmbio não é aplicado às cobranças.</p>
 </section>;
}
