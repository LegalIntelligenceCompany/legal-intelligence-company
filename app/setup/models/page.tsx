import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {createClient} from '@/lib/supabase/server';
import {isBillingTester} from '@/lib/billing';
import {reviewerCatalogue,reviewerKey} from '@/lib/reviewer-catalogue';
import {meterConfiguration} from '@/lib/commercial-meter';
import {ModelAccessCheck} from '@/components/model-access-check';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createAdminClient} from '@/lib/supabase/admin';
import {pilotAccount,pilotEnabled,PILOT_EXPIRES} from '@/lib/ai-pilot';
import {ServicesSetup} from '@/components/services-setup';
import {ClaudePilotTest} from '@/components/claude-pilot-test';
import {ClaudeCountDiagnostic} from '@/components/claude-count-diagnostic';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const metadata={title:'Modelos e fornecedores | LIC',robots:{index:false,follow:false}};
export default async function Page(){
 const client=await createClient();const user=(await client?.auth.getUser())?.data.user;
 if(!user?.email_confirmed_at||!isBillingTester(user.email,(process.env.BILLING_TEST_EMAIL||'').trim().toLowerCase()))return <AppShell><h1>Configuração reservada</h1><Link href="/login?next=/setup/models">Entrar</Link></AppShell>;
 let rows:ReturnType<typeof reviewerCatalogue>=[],invalid=false;try{rows=reviewerCatalogue();}catch{invalid=true;}
 const admin=pilotAccount(user)?createAdminClient():null;
 const trial=admin?await admin.from('ai_claude_pilot').select('status,result').eq('singleton',true).eq('owner_id',user.id).maybeSingle():null;
 const budget=admin?await admin.from('ai_pilot_budget').select('reserved_cents,limit_cents,expires_at').eq('singleton',true).eq('owner_id',user.id).maybeSingle():null;
 const installed=!!trial&&!trial.error;
 const available=budget?.data?Math.max(0,Math.min(budget.data.limit_cents,1000)-budget.data.reserved_cents):0;
 const canTest=installed&&!trial?.data&&available>=100&&!!process.env.ANTHROPIC_API_KEY&&pilotEnabled()&&process.env.AI_EXECUTION_ENABLED==='true'&&Date.now()<Date.parse(PILOT_EXPIRES)&&Date.now()<Date.parse(budget?.data?.expires_at||'');
 return <AppShell><div className="eyebrow">Reservado ao titular · teste pago apenas com confirmação</div><h1>Modelos e fornecedores</h1>
 {pilotAccount(user)&&<><ClaudeCountDiagnostic/>{typeof trial?.data?.result?.diagnostic==='string'&&<p role="status">Diagnóstico guardado da tentativa: {trial.data.result.diagnostic}</p>}</>}
 <section className="card team-panel"><h2>Escolha do cliente</h2><p>Além dos motores OpenAI existentes, o chat aceita modelos de texto Claude e Gemini configurados pelo titular. A pesquisa das fontes continua em OpenAI; o modelo escolhido elabora e revê a resposta a partir desse material, sem consulta independente às fontes.</p><p>Não são todos os modelos existentes no mercado. O catálogo é extensível aos modelos compatíveis destes adaptadores. A presença na lista não prova acesso nem qualidade jurídica; nenhum modelo novo fica activo automaticamente.</p></section>
 {pilotAccount(user)&&<section className="card team-panel"><h2>Teste único Claude Sonnet — até 1 €</h2><p>Usa o orçamento de teste existente, sem o aumentar. Disponível para novas reservas: {(available/100).toFixed(2).replace('.',',')} €. A reserva fica registada mesmo se a tentativa falhar. Não corresponde ao custo efectivo da factura.</p>{!installed?<><p>Falta instalar a protecção do teste. Copie apenas este SQL 017 para o SQL Editor do Supabase e execute. Não repõe saldo, não faz chamadas à IA e não activa pagamentos. Depois actualize esta página.</p><ServicesSetup sql={readFileSync(join(process.cwd(),'supabase/migrations/017_claude_pilot.sql'),'utf8')}/></>:trial?.data?<><p role="status">{trial.data.status==='completed'?'Teste concluído. A resposta abaixo exige revisão humana; nenhum modelo foi activado.':'Tentativa já reservada, em curso ou com resultado incerto. Não será repetida. A reserva mantém-se.'}</p>{trial.data.status==='completed'&&<><p style={{whiteSpace:'pre-wrap'}}>{trial.data.result?.answer}</p><p>Modelo: {trial.data.result?.model}. Tokens de entrada: {trial.data.result?.usage?.input_tokens}; saída: {trial.data.result?.usage?.output_tokens}.</p></>}</>:<>{!canTest&&<p>Teste bloqueado: confirme saldo mínimo de 1 €, chave Anthropic, interruptores do piloto e validade do orçamento.</p>}<ClaudePilotTest disabled={!canTest}/></>}</section>}
 <section className="card team-panel"><h2>Estado por modelo</h2><p>Verifique o acesso sem gerar texto nem alterar tarifas, saldos ou activação. O resultado é pontual e não fica guardado; não comprova qualidade jurídica nem compatibilidade da geração.</p>{invalid?<p role="alert">AI_REVIEW_MODELS_JSON inválido. O catálogo adicional está bloqueado.</p>:<ul>{rows.map(row=>{let ready=false;try{meterConfiguration(row.id as `review-${string}`);ready=true;}catch{/* Fail closed */}return <li key={row.id}><strong>{row.label}</strong> · {row.model}<br/>Chave: {process.env[reviewerKey(row.provider)]?'configurada':'em falta'} · Compatibilidade: {row.validated?'declarada pelo titular':'por validar'} · Tarifas: {ready?'configuração aceite':'pendentes ou expiradas'}<ModelAccessCheck id={row.id} disabled={!process.env[reviewerKey(row.provider)]}/></li>;})}</ul>}</section>
 <section className="card team-panel"><h2>O que fazer a seguir</h2><ol><li>Criar acesso API na <a href="https://platform.claude.com">Anthropic</a> e no <a href="https://aistudio.google.com/apikey">Google AI Studio</a>. Rever facturação e condições de tratamento de dados.</li><li>Na Vercel, no projecto, adicionar ANTHROPIC_API_KEY e GEMINI_API_KEY como segredos do servidor. Nunca usar NEXT_PUBLIC nem enviar chaves por chat.</li><li>Configurar AI_REVIEW_MODELS_JSON com id, label, provider (anthropic ou google), model (identificador exacto) e validated. Só marcar validated como true depois de validar compatibilidade e resposta com fontes.</li><li>Em AI_COMMERCIAL_TARIFFS_JSON, criar para cada id uma lista de duas etapas: pesquisa GPT-5 mini e revisão com o modelo exacto escolhido, sem ferramentas. Incluir tarifas, limites, validade e câmbio revistos. Não copiar preços de outro modelo.</li><li>Publicar e confirmar o estado nesta página. A escolha comercial continua dependente de subscrição, saldo, consentimento e activação comercial. O piloto de 10 € não autoriza estes novos fornecedores.</li></ol><p>Não é necessário novo SQL para esta integração, se a actualização 016 já foi executada. Sem configuração completa, não é iniciada uma pesquisa paga com estes modelos. Não há repetição automática de chamadas que falhem.</p></section>
 <p>Documentação: <a href="https://platform.claude.com/docs/en/models/overview">Modelos Claude</a> · <a href="https://ai.google.dev/api/models">Modelos Gemini</a>. As versões exactas, tarifas e limites devem ser revistos antes da activação.</p><Link className="btn btn-secondary" href="/setup/tariffs">Tarifas e consumo</Link>
 </AppShell>;
}
