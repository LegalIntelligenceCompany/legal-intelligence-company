import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {ServicesSetup} from '@/components/services-setup';
import {createClient} from '@/lib/supabase/server';
import {isBillingTester} from '@/lib/billing';
export const dynamic='force-dynamic';
export const metadata={title:'Contabilização de IA | LIC',robots:{index:false,follow:false}};
export default async function Page(){
 const client=await createClient();const user=(await client?.auth.getUser())?.data.user;
 if(!user?.email_confirmed_at||!isBillingTester(user.email,(process.env.BILLING_TEST_EMAIL||'').trim().toLowerCase()))return <AppShell><h1>Configuração reservada</h1><Link href="/login?next=/setup/metering">Entrar</Link></AppShell>;
 const sql=['013_inference_wallet.sql','014_live_credit_funding.sql','015_audio_metering.sql'].map(file=>readFileSync(join(process.cwd(),'supabase/migrations',file),'utf8')).join('\n\n');
 return <AppShell><h1>Contabilização de IA</h1><p>Esta actualização liga reservas, comprovativos de consumo e descontos à pesquisa do chat. Exige as actualizações 001 e 010. Pode ser repetida sem repor saldos.</p>
 <div role="note" className="card"><h2>Não activa cobranças</h2><p>A carteira comercial começa sem dinheiro e não recebe saldo da carteira de teste. A migração não faz chamadas de IA, não aumenta o piloto de 10 € e não cobra cartões.</p><p>Mantenha <code>AI_COMMERCIAL_ENABLED</code> desligado até existir financiamento real validado, tarifas e câmbio revistos. Não introduza saldos manualmente para simular pagamentos reais.</p></div>
 <ServicesSetup sql={sql}/><h2>Antes da activação comercial</h2><p>O financiamento está implementado em /credits, mas bloqueado por configuração. É necessário confirmar os preços Stripe de 49 € e 99 € antes de IVA, condições de venda, impostos, webhook live, tarifas versionadas e câmbio. A leitura de subscrições é confirmada na Stripe antes de cada reserva.</p>
 <p>Os acertos conhecidos libertam a diferença entre a reserva e o consumo confirmado. Pedidos com consumo incerto conservam a reserva para reconciliação; não são repetidos nem tratados como gratuitos.</p>
 <p>A ligação inclui pesquisa do chat, ferramentas documentais, análises e transcrição. Cada serviço exige tarifas próprias, confirmação da reserva pelo cliente e saldo pré-pago. O piloto mantém-se separado. A pesquisa do chat é recuperável; exporte os resultados documentais e as transcrições antes de sair.</p>
 <Link className="btn btn-primary" href="/setup/launch">Guia de lançamento e pendências</Link> <Link className="btn btn-secondary" href="/chat">Voltar ao chat</Link></AppShell>;
}
