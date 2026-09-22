import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ServicesSetup } from '@/components/services-setup';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pilotAccount, pilotEnabled } from '@/lib/ai-pilot';

export const dynamic = 'force-dynamic';
export default async function Page() {
 const client = await createClient();
 const user = client ? (await client.auth.getUser()).data.user : null;
 if (!pilotAccount(user)) return <AppShell><h1>Teste de IA restrito</h1><p>Entre com a conta de teste autorizada e com o e-mail confirmado.</p><Link href="/login">Entrar</Link></AppShell>;
 const admin = createAdminClient();
 const result = admin ? await admin.from('ai_pilot_budget').select('*').eq('singleton',true).maybeSingle() : null;
 const budget = result && !result.error && result.data && result.data.owner_id === user?.id ? result.data : null;
 const sql = readFileSync(join(process.cwd(),'supabase/migrations/009_ai_pilot.sql'),'utf8')+'\n'+readFileSync(join(process.cwd(),'supabase/migrations/011_pilot_total_10.sql'),'utf8');
 const limit=budget?.limit_cents??500;
 const money = (value:number) => (value/100).toFixed(2).replace('.',',')+' €';
 return <AppShell><h1>Orçamento de teste IA</h1>
  <p>Limite autorizado: 10 € no total, incluindo reservas anteriores. Motor económico: GPT-5 mini. Motor avançado: pesquisa GPT-5 mini e revisão GPT-6 Astra. Apenas a sua conta pode utilizar este piloto.</p>
  <p role="status">{budget ? `Limite aplicado: ${money(limit)}. Reservado: ${money(budget.reserved_cents)}. Disponível para novas reservas: ${money(Math.max(0,limit-budget.reserved_cents))}.` : 'Orçamento ainda não preparado. Execute o SQL abaixo antes de activar chamadas.'}</p>
  <p>Execução: {pilotEnabled() && process.env.AI_EXECUTION_ENABLED === 'true' ? 'interruptores ligados' : 'desligada'}. O orçamento, a conta e a validade são novamente verificados antes de cada tentativa. Termina em 29/09/2026 às 23:59 UTC; não renova automaticamente.</p>
  <p>Reserva por tentativa: pesquisa económica 1,50 €; pesquisa com revisão avançada 4,50 €; documentos privados 0,60 €; análise de contrato 1,30 €; transcrição 0,20 €. São reservas conservadoras, não o custo efectivo facturado. Falhas e pedidos interrompidos também conservam a reserva. O limite cobre este piloto, não outras aplicações que utilizem a mesma chave API.</p>
  <p>Áudio no piloto: apenas WAV PCM de 16 bits, até 60 segundos e 3 MB. Use conteúdos fictícios, sem dados pessoais ou confidenciais.</p>
  <h2>Activar uma única vez</h2><ol><li>Execute este SQL no Supabase. Repetir não repõe o orçamento.</li><li>Na Vercel, defina AI_PILOT_ENABLED e AI_EXECUTION_ENABLED como true no ambiente que vai testar, mantendo a chave OpenAI no servidor, e faça um novo deploy.</li><li>Volte aqui para confirmar o orçamento antes de abrir o chat.</li></ol>
  <p>Para parar imediatamente novos pedidos, coloque AI_EXECUTION_ENABLED em false e publique novamente. Não cancela pedidos já iniciados. Não active pagamentos reais na Stripe para este teste.</p>
  <ServicesSetup sql={sql}/><p><Link href="/chat">Abrir chat</Link> · <Link href="/transcription">Transcrição</Link></p>
 </AppShell>;
}
