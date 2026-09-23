import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {TariffSimulator} from '@/components/tariff-simulator';
import {createClient} from '@/lib/supabase/server';
import {isBillingTester} from '@/lib/billing';
import {meterConfiguration,meterServices} from '@/lib/commercial-meter';
import {referenceExchange} from '@/lib/reference-exchange';
import {referenceTariffs,tariffReviewDate,tariffReviewUntil,ecbSource} from '@/lib/tariff-preparation';
export const dynamic='force-dynamic';
export const metadata={title:'Preparar tarifas e consumo | LIC',robots:{index:false,follow:false}};
const names={economical:'Chat económico',advanced:'Chat avançado',document:'Documentos privados','assistant-research':'Pesquisa nas ferramentas',analysis:'Análise de contratos',transcription:'Transcrição de áudio'};
export default async function Tariffs(){
 const client=await createClient();const user=(await client?.auth.getUser())?.data.user;
 if(!user?.email_confirmed_at||!isBillingTester(user.email,(process.env.BILLING_TEST_EMAIL||'').trim().toLowerCase()))return <AppShell><h1>Configuração reservada</h1><Link href="/login?next=/setup/tariffs">Entrar</Link></AppShell>;
 const exchange=await referenceExchange();
 const expired=Date.now()>=Date.parse(tariffReviewUntil);
 return <AppShell><div className="eyebrow">Reservado ao titular · sem operações pagas</div><h1>Preparar tarifas e consumo</h1>
  <section className="card team-panel"><h2>O que está preparado</h2><p>A regra comercial é custo agregado confirmado × 3, convertido em euros, antes de IVA. A reserva cobre o máximo aprovado pelo cliente; a diferença só é libertada após confirmação do consumo.</p><p>Esta página não activa compras, não grava tarifas, não altera saldos e não aumenta o orçamento de teste. Não é necessário repetir o SQL para a consultar.</p></section>
  <section className="card team-panel"><h2>Tarifas publicadas de referência</h2><p>USD por milhão de tokens, processamento Standard, endpoint global. Consulta: {tariffReviewDate}. {expired?'Revisão expirada: verificar novamente as fontes antes de configurar.':'Referência para preparação; não constitui configuração de produção.'}</p>
  <div style={{overflowX:'auto'}}><table><caption>Modelos de texto actualmente integrados</caption><thead><tr><th scope="col">Modelo</th><th scope="col">Entrada</th><th scope="col">Entrada em cache</th><th scope="col">Saída</th></tr></thead><tbody>{referenceTariffs.map(t=><tr key={t.model}><th scope="row"><a href={t.source}>{t.model}</a></th><td>{t.input}</td><td>{t.cached}</td><td>{t.output}</td></tr>)}</tbody></table></div>
  <ul>{referenceTariffs.map(t=><li key={t.model}>{t.model}: {t.extra}</li>)}</ul><p><a href="https://developers.openai.com/api/docs/pricing">Tabela oficial de preços e ferramentas</a>. O consumo de raciocínio já está incluído nos tokens de saída: não se soma duas vezes.</p></section>
  {exchange?<TariffSimulator exchange={exchange}/>:<section className="card team-panel"><h2>Câmbio temporariamente indisponível</h2><p>Não foi obtida uma referência recente e válida. O simulador fica indisponível; não usamos um câmbio inventado. Pode recarregar esta página mais tarde.</p></section>}
  <p><a href={ecbSource}>Fonte do câmbio: Banco Central Europeu</a>. A consulta é actualizada ao abrir esta página, com cache até uma hora. O BCE publica taxas informativas, não cotações para transacções; a política de câmbio comercial e eventuais custos bancários ainda têm de ser definidos.</p>
  <section className="card team-panel"><h2>Configuração de produção por serviço</h2><ul>{meterServices.map(service=>{let ceiling:number|null=null;try{ceiling=meterConfiguration(service).ceiling;}catch{/* No secret configuration is returned to the browser. */}return <li key={service}>{names[service]}: {ceiling===null?'configuração ausente, incompleta ou fora da validade':`configuração aceite pelo validador; reserva máxima ${(ceiling/100).toFixed(2)} € antes de IVA`}.</li>;})}</ul><p>Uma configuração aceite pelo validador não prova acesso ao modelo nem valida os custos efectivamente facturados pelo fornecedor.</p></section>
  <section className="card team-panel"><h2>Bloqueios técnicos que ainda têm de ser resolvidos</h2><ol><li>Confirmar o limite agregado de entrada por pedido, incluindo pesquisas internas. A dimensão do contexto não é, por si só, um limite ao consumo agregado de várias etapas.</li><li>Completar a contabilização de escrita de cache e escalões de contexto do GPT-6 Astra. O adaptador actual recusa modalidades desconhecidas; não as considera gratuitas.</li><li>Validar separadamente as tarifas de texto e áudio da transcrição e os limites agregados do ficheiro. O preço aproximado por minuto não substitui um comprovativo de consumo.</li><li>Publicar tarifas versionadas e uma política de câmbio comercial, com validade e revisão. A consulta informativa acima não as substitui.</li></ol><p>Não marque a revisão dos limites como concluída só para fazer desaparecer um aviso. A activação permanece separada desta preparação.</p></section>
  <Link className="btn btn-secondary" href="/setup/launch">Voltar à preparação do lançamento</Link>
 </AppShell>;
}
