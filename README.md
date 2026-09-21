# Legal Intelligence Company

MVP Next.js + TypeScript, Supabase Auth/DB/Storage e OpenAI no backend. Interface em português, landing page, empresas/equipa, contratos privados, políticas e análise assistida por IA.

## Estado real e limites

- Login por link de e-mail; criação/selecção de empresa; convites de equipa por link.
- Upload privado de PDF/DOCX até 20 MB, recuperação de uploads e download autenticado.
- Políticas reais: criar, editar, pesquisar, arquivar e restaurar.
- Análise **de PDFs até 10 MB**, com confirmação de envio, pesquisa jurídica web e custos, Responses API, JSON estruturado e validação no servidor. DOCX precisa de conversão para PDF.
- Relatório com resumo, limitações, prioridades, citações do contrato e referências às políticas. As citações de políticas são verificadas contra a versão guardada; as páginas e citações do PDF são propostas pela IA e exigem confirmação humana.
- Estados persistentes processing/completed/failed; actualização automática; uma análise simultânea por empresa, máximo 20 tentativas em 24 horas. Consultar o relatório não chama OpenAI. Nova análise requer confirmação e tem novo custo.
- Cada análise guarda uma cópia das políticas activas. Reanalisar mantém o histórico na base de dados; a interface mostra a versão mais recente.
- A API nunca devolve resultados fictícios como reais. A página /contracts/demo-analysis é um exemplo separado.
- **Ainda não inclui:** RAG/pgvector, cobertura exaustiva de legislação/jurisprudência, bases jurídicas fechadas, certificação de vigência ou aplicabilidade, extracção local de DOCX, antivírus, fila durável, e-mails automáticos de convite ou eliminação de documentos.
- O pedido de análise é síncrono: classificação até 45 s, pesquisa até 75 s, síntese até 90 s; duração máxima da rota 240 s. Se o processo morrer, a reserva expira após cinco minutos; uma nova tentativa pode gerar novo custo. Para escala/produção, adoptar um worker/fila e rever limites do alojamento.
- Não é um produto certificado nem substitui revisão jurídica. Não carregar documentos sensíveis antes de validar privacidade, acessos, retenção e contratos com os fornecedores.

## Executar no Mac

Recomendado Node.js 22.18+ (necessário para os testes). Na pasta do projecto:

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Mantenha esse Terminal aberto. Para reiniciar, Control+C e depois npm run dev.

Se ainda não existir .env.local, crie-o a partir de .env.example. **Não substitua um .env.local já preenchido.** Abra-o num editor de texto, não na vista de comentários de alterações.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=CHAVE_PUBLICAVEL
OPENAI_API_KEY=CHAVE_PRIVADA_OPENAI
OPENAI_MODEL=gpt-5-mini
OPENAI_RESEARCH_MODEL=
SUPABASE_SERVICE_ROLE_KEY=CHAVE_SECRETA_SUPABASE
```

Os nomes são exactos. Os valores acima são exemplos, não chaves. A variável SUPABASE_SERVICE_ROLE_KEY aceita a nova chave sb_secret_... ou a antiga service_role; nunca a chave publicável. As duas chaves privadas **não** têm prefixo NEXT_PUBLIC_. Não enviar chaves por chat/comentários, não guardar em Git e revogar qualquer chave exposta. Reiniciar depois de alterações.

Sem configuração externa, pode ver a landing page e o exemplo de relatório; as áreas reais indicam falta de configuração/autenticação em vez de simular dados guardados.

## Configurar Supabase

1. Crie uma conta e um projecto em https://supabase.com/dashboard.
2. Nas definições do projecto, API Keys, obtenha a Project URL e a chave publicável. Coloque-as nas variáveis NEXT_PUBLIC_ acima. A URL termina em .supabase.co, sem /rest/v1.
3. No SQL Editor, execute **o conteúdo** dos ficheiros, por ordem:
   - supabase/migrations/001_initial_schema.sql (apenas na instalação inicial).
   - supabase/migrations/002_team.sql (uma vez).
   - supabase/migrations/003_documents.sql (repetível).
   - supabase/migrations/004_analysis.sql (repetível).
4. Para copiar facilmente a 003, abra /setup/documents. Para a 004, /setup/analysis. Use o botão Copiar código SQL, crie uma consulta nova no Supabase, cole e clique Run. Espere Success. Não cole apenas o nome/caminho do ficheiro.
5. A 003 configura o bucket contracts como privado e as regras por empresa; não active Public bucket.
6. Active o fornecedor Email em Authentication. Configure Site URL como http://localhost:3000 e permita http://localhost:3000/auth/callback nas Redirect URLs para desenvolvimento.
7. Configure SMTP próprio para envio fiável de links. O envio padrão tem limites. Se usar Gmail num teste, use uma palavra-passe de aplicação da mesma conta do utilizador SMTP, nunca a palavra-passe normal. Para produção, use um serviço de e-mail transaccional adequado.
8. Para guardar análises, crie uma chave secreta de servidor em Settings → API Keys e coloque-a apenas em SUPABASE_SERVICE_ROLE_KEY no servidor. Esta chave tem privilégios elevados e nunca é enviada para o browser. [Documentação de chaves Supabase](https://supabase.com/docs/guides/getting-started/api-keys).
9. Entre no site usando o link de e-mail no mesmo computador/navegador onde iniciou o pedido; mantenha o servidor a funcionar. Em Equipa, crie a empresa.
10. Teste uma política e um PDF fictício. Confirme que ficam guardados após actualizar a página.

### Equipa

O proprietário convida administradores ou membros; administradores apenas membros. O link de convite expira em sete dias. O destinatário entra com o e-mail convidado e volta a abrir o link original para aceitar. Os tokens são guardados sob forma de hash. Não há envio automático de e-mail de convite. Links localhost não funcionam nos computadores dos colegas: publique antes de partilhar externamente.

## Configurar e usar OpenAI

1. Na plataforma OpenAI, configure facturação e crie uma chave de projecto. A API é facturada separadamente do ChatGPT.
2. Guarde a chave nova em OPENAI_API_KEY, apenas no servidor. O modelo predefinido é gpt-5-mini; OPENAI_MODEL permite substituí-lo por um modelo compatível com PDF, Responses, structured outputs e reasoning effort low. OPENAI_RESEARCH_MODEL é opcional; vazio usa o mesmo modelo e requer suporte à ferramenta web_search.
3. Confirme a migração 004 e a chave secreta Supabase. Reinicie o servidor.
4. Abra Contratos, escolha um PDF até 10 MB, indique o país da lei aplicável (ou identificação automática) e leia a confirmação. O contrato completo e as políticas activas serão enviados à OpenAI. A pesquisa web recebe apenas temas e países genéricos de listas controladas. Até 30 políticas e 50 000 caracteres no conjunto; acima disso, o pedido é recusado, sem truncar silenciosamente.
5. Marque a autorização e clique Analisar contrato. Aguarde. Em caso de falha, a página explica o motivo; não inventa conclusões.
6. Confira os trechos e páginas no PDF original. Uma análise sem findings não significa que é seguro assinar.

A implementação segue [entradas de ficheiros](https://developers.openai.com/api/docs/guides/file-inputs), [respostas estruturadas](https://developers.openai.com/api/docs/guides/structured-outputs) e [pesquisa web](https://developers.openai.com/api/docs/guides/tools-web-search). Envia o PDF em base64 directamente nos pedidos privados, sem criar ficheiros persistentes na Files API. Usa store:false, mas isso **não garante retenção zero**; rever [controlos de dados](https://developers.openai.com/api/docs/guides/your-data). Políticas, contrato e páginas web são dados não confiáveis; a resistência a instruções maliciosas não é uma garantia absoluta.

### Pesquisa jurídica durante a análise

Não requer nova migração: a actualização 004 já guarda relatórios JSON. Não precisa de outra chave além da OpenAI. O utilizador deve aceitar novamente a autorização, agora incluindo fornecedores/custos de pesquisa. Para relatórios antigos, usar **Criar nova análise**: abrir um relatório guardado não o actualiza nem gera custos.

1. **Classificação privada, sem ferramentas:** lê o PDF e escolhe até seis temas jurídicos de uma lista fechada. Identifica até três países cuja lei é expressa, sem deduzir a lei da língua, morada ou foro. O utilizador pode indicar o país. Se a lei continuar ambígua, não pesquisa às cegas: guarda relatório parcial e pede esclarecimento.
2. **Pesquisa pública separada:** recebe apenas países, tipo genérico de contrato e temas normalizados. Não recebe PDF, nomes, cláusulas, políticas, IDs de conta ou texto livre do classificador. Usa web_search real, tool_choice required, acesso externo activo, no máximo seis chamadas e vinte fontes apresentadas. Prioriza legislação oficial, tribunais e reguladores; em Portugal sugere Diário da República e DGSI, e para a UE EUR-Lex/CURIA. Não restringe toda a web a esses quatro domínios.
3. **Síntese privada sem ferramentas:** compara o PDF/políticas com o dossier da pesquisa, produz até doze pontos prioritários, relação da fonte com a cláusula, artigo/processo quando disponível, indicação temporal e redacção alternativa. As propostas nunca alteram o original automaticamente.

Os links autorizados vêm das anotações/metadados reais da ferramenta, não de URLs escritos livremente pelo modelo. Um finding jurídico só pode referenciar um id citado na síntese da pesquisa. Isso verifica a **proveniência do link**, não a veracidade integral da conclusão, a existência exacta do artigo referido, a vigência ou a aplicabilidade ao caso. A interface apresenta as fontes junto dos findings e exige conferência humana. Os rótulos de domínio oficial cobrem quatro domínios previamente identificados, não certificam o conteúdo nem classificam todos os outros sites como não oficiais.

Se o motor falhar, não pesquisar realmente ou não devolver fontes citáveis, o relatório mostra explicitamente uma revisão parcial, sem findings jurídicos fundamentados em memória. Bases pagas, resultados não indexados, páginas bloqueadas, direito regional e a aplicação temporal aos factos podem exigir investigação adicional. Cada análise custa mais do que a versão anterior (até três pedidos de modelo e chamadas de pesquisa). O limite de 20 tentativas/dia não é um limite monetário global.

## Segurança e persistência

As leituras de contratos, ficheiros e relatórios usam a sessão do utilizador e RLS. As funções de início/fim de análise só são executáveis por service_role; verificam actor, empresa, estado, expiração e limites. O actor é obtido por auth.getUser() no backend, não pelo corpo do pedido. As escritas de resultados são reservadas ao backend; utilizadores autenticados não podem fabricar relatórios por chamadas directas à base de dados. Não se devolvem erros brutos do fornecedor, chaves ou documentos nos logs da aplicação.

O backend recusa POSTs fora da origem, exige consentimento, limita o corpo do pedido, valida o PDF e limita a saída. Não executa instruções devolvidas pelo modelo nem apresenta HTML produzido por ele. Relatórios/cópias de políticas têm a mesma visibilidade da empresa, mesmo que a política seja posteriormente arquivada.

## Testes e verificação

```bash
npm run lint
npm run typecheck
npm test
NEXT_BUILD_DIR=.next-check npm run build
```

A pasta de build alternativa evita interferir com o servidor de desenvolvimento. A suite cobre validação/API com OpenAI e Supabase simulados, incluindo consentimento de pesquisa, isolamento do PDF, fontes inventadas, falhas de pesquisa, lei ambígua e relatórios antigos. Não foi feita uma chamada paga nem enviados contratos reais à OpenAI durante estes testes. A pesquisa real ainda deve ser validada na conta configurada com um documento fictício.

Teste SQL local independente (não lê .env.local nem liga à sua base):

```bash
npm install --prefix work/sql-test --no-save --ignore-scripts @electric-sql/pglite
node tests/sql-analysis.mjs
```

Executado: 26 verificações de SQL/RLS, migrações 001–004, isolamento entre duas empresas, bloqueio de escritas do cliente, reutilização de análise, snapshots, expiração, revogação de membro e limite diário. Também executa supabase/tests/documents_access.sql. O ambiente local simula auth/storage; só substitui a extensão uuid-ossp pela função UUID nativa. **Não substitui testar a configuração real do Supabase/Storage nem concorrência em produção.**

## Publicar na Vercel

1. Crie um repositório Git privado e envie o código, excluindo .env.local, node_modules, .next, .next-check e work (já em .gitignore).
2. Em https://vercel.com/new importe esse repositório e seleccione Next.js. Não defina NEXT_BUILD_DIR no alojamento; use o build padrão.
3. Em Settings → Environment Variables, configure as variáveis do exemplo (OPENAI_RESEARCH_MODEL é opcional). Para Preview use um projecto Supabase e credenciais de teste separados, não dados de produção.
4. Faça deploy. Confirme que o plano/runtime permite a duração de 240 segundos configurada em /api/analyse; adapte para fila/worker antes de aceitar análises que excedam esse tempo.
5. No Supabase Authentication → URL Configuration, defina o domínio HTTPS publicado como Site URL e autorize https://SEU-DOMINIO/auth/callback. Mantenha localhost apenas enquanto precisar de desenvolvimento. Os convites devem ser criados no domínio publicado.
6. Teste login, criação de empresa, convite com segunda conta, isolamento de empresas, upload/download, análise de um PDF fictício, falhas de saldo, recarregamento e políticas alteradas.
7. Antes de clientes reais: revisão de segurança e jurídica, política de privacidade/retenção e eliminação, backups, monitorização, limites de gasto e controlo de abuso entre múltiplas empresas. O limite por empresa do MVP não é um tecto global de facturação.

## Estrutura

- app/api/analyse/route.ts — autenticação, autorização, OpenAI e persistência.
- lib/analysis.ts — esquema, validação e mensagens seguras.
- lib/legal-research.ts — temas controlados, plano de pesquisa, fontes e instruções de fundamentação.
- lib/supabase/admin.ts — cliente privilegiado, protegido como server-only.
- components/contract-analysis.tsx — consentimento, estados e relatório.
- supabase/migrations/004_analysis.sql — análises privadas, permissões, reservas e limites.
- app/setup/analysis — código SQL copiável e instruções de activação.
- tests — testes sem segredos/documentos reais.

## Diagnóstico seguro de falhas de análise

As novas tentativas escrevem linhas `[analysis-diagnostic]` no Terminal do servidor (ou nos logs da função na Vercel) quando falham. Incluem a referência da análise, etapa, código controlado, tempo decorrido e, quando disponíveis, estado HTTP e códigos de rede/fornecedor de uma lista fechada. Não incluem mensagens brutas, stacks, cabeçalhos, chaves, nomes de ficheiros, documentos, políticas ou respostas da IA. Não active logs de depuração integrais do SDK.

O aviso no site mostra a etapa da falha e a mesma referência quando recebe a resposta do servidor. Depois de recarregar, mantém apenas a referência e o erro guardado; a etapa detalhada deve ser consultada nos logs. Falhas antigas não ganham detalhes retroactivamente. Os logs têm a retenção do ambiente de execução; num Terminal são perdidos se a sessão for fechada sem os guardar.

“Actualizar estado” só consulta o estado guardado: não inicia análise nem pesquisa. Não repita análises automaticamente para obter diagnósticos; uma nova tentativa exige consentimento e pode ter custos. Para comunicar um erro, partilhe apenas a linha `[analysis-diagnostic]` correspondente à referência, nunca o ficheiro `.env.local`.

Esta alteração não requer nova migração SQL. Reinicie o servidor para garantir que utiliza o código actualizado. A identificação dos erros segue a [documentação oficial da OpenAI](https://developers.openai.com/api/docs/guides/error-codes); acrescentar diagnósticos não corrige, por si só, a causa de uma falha anterior.
