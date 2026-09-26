# Camada técnica LIC 020

Esta actualização implementa ferramentas de trabalho e controlos verificáveis. Não
activa pagamentos, não aumenta o orçamento de IA, não muda tarifas, não reactiva
fornecedores desactivados e não constitui certificação de qualidade jurídica.

## Publicar a versão

1. Enviar esta versão do repositório para a branch usada pela Vercel e confirmar
   que o deployment desse commit fica Ready. O lockfile é pnpm; Node 24 é o
   ambiente de validação. Não apagar nem substituir as variáveis existentes.
2. Entrar com a conta titular em `/setup/workspace`. Se mostrar a estrutura 020
   em falta, copiar **uma vez** o SQL completo e executar no Supabase. Pressupõe
   as migrações anteriores, incluindo 018 e 019. Se já estiver detectada, não é
   necessário repetir. Não criar políticas RLS manuais por cima da migração.
3. Para continuar pesquisas depois de fechar o navegador, criar no **mesmo
   projecto OpenAI da chave de servidor da LIC** um webhook apontado para
   `https://legal-intelligence-company.vercel.app/api/research/webhook`, com eventos
   `response.completed`, `response.failed`, `response.incomplete` e
   `response.cancelled`. Guardar o segredo de assinatura em
   `OPENAI_WEBHOOK_SECRET`, apenas no servidor Vercel, e publicar novamente.
   Este segredo não é `OPENAI_API_KEY`. Nunca o enviar por chat ou para o Git.
4. Consultar `/setup/workspace`: instalação, entregas tratadas/pendentes, pesquisas
   sem avanço e auditoria. Uma variável preenchida não prova entrega. Uma notificação
   com ID fictício não corresponde a uma pesquisa guardada e recebe 503 para
   permitir nova tentativa. Não enviar gerações de teste repetidamente.
5. Antes de abrir a clientes, executar **um ensaio ponta a ponta autorizado e com
   limite de custo** no ambiente publicado: iniciar uma pesquisa genérica, fechar a
   página, verificar as entregas assinadas, recuperar o resultado, confirmar um
   único débito e conferir as citações. Este ensaio não foi executado nesta entrega.

A pesquisa verifica novamente conta, acesso, interruptores e reservas. Não há
retry automático de uma geração cuja recepção seja incerta. Duplicar a notificação
não pode iniciar uma segunda revisão graças à transição atómica. O processamento
HTTP declara duração máxima de 120 segundos; confirmar suporte no alojamento.

Opcionalmente, um agendador existente pode chamar `GET /api/maintenance/research`
com `Authorization: Bearer CRON_SECRET` a cada minuto. O segredo exige pelo menos
32 caracteres. São tratados no máximo dois pedidos já autorizados por chamada.
Não foi criado um agendamento novo nem contratado um plano de alojamento. A limpeza
já existente elimina também auditoria com mais de 90 dias quando configurada.

## O que está disponível

| Área | Comportamento implementado | Limite importante |
| --- | --- | --- |
| Dossiers | Factos, intervenientes, provas, tarefas, contradições, documentos e fontes; cronologia, relações, versões e pesquisa portuguesa com controlo de acesso | As datas e os estados são declarados pelo utilizador; não são factos juridicamente certificados |
| Fontes históricas | Importação manual de texto de DR, DGSI, EUR-Lex e CURIA; referência, jurisdição, intervalo de datas e consulta por data | Não é um corpus integral PT/UE; não infere automaticamente revogações ou vigência |
| Afirmações e excertos | Até três páginas oficiais citadas recuperadas para a revisão avançada; excertos limitados, data e hash; correspondência literal e indicação de suporte/contradição/insuficiência | O juízo semântico continua a ser da IA; excertos ausentes ou inacessíveis não passam por verificados. A revisão económica não faz esta recuperação adicional |
| Pesquisa persistente | Worker partilhado com a página, eventos assinados, recepção persistente, recuperação e prevenção de duplicação | Requer webhook publicado e validado; análises documentais síncronas não foram convertidas para este mecanismo |
| PDF e OCR | `/document-workbench`: leitura local até 20 MB/200 páginas, pesquisa por página, imagem original, OCR PT/EN por página, revisão e exportação | Até 500 mil caracteres extraídos; OCR não certifica leitura de tabelas, páginas difíceis ou notas. Confiança OCR não mede correcção jurídica |
| Word | `/word-review`: edição de parágrafos/células, conservação de notas e alterações controladas; regras próprias com aprovação individual | Regras literais, não interpretação jurídica. Parágrafos com âncoras de notas não são reescritos; imagens/campos/revisões existentes incompatíveis são recusados |
| Modelos | Encaminhamento opcional por resultados recentes, aprovados e revistos por pessoas; sem fallback pago silencioso | Nenhum novo modelo é automaticamente aprovado. Claude continua dependente do interruptor anterior |
| Segurança e operação | RLS, pesquisa limitada ao conteúdo autorizado, auditoria de metadados, revogação, restauro local e pipeline de qualidade | Não equivale a auditoria independente, teste de carga em produção ou prova de resistência absoluta a instruções maliciosas |
| Avaliação | `/benchmarks`: 20 casos sintéticos, registo/importação de respostas existentes, revisão humana, tempo e custo | Não gera respostas nem consome IA. Não mede supremacia sobre concorrentes nem substitui casos jurídicos de referência validados |

Os documentos usados no leitor e na revisão Word permanecem no dispositivo; o
utilizador decide o que exportar ou guardar no dossier. A pesquisa web não recebe
automaticamente texto privado dos dossiers. A pesquisa global é lexical, não
vectorial, com limite de 50 resultados; pode ser restringida a um dossier.

## Avaliações que podem orientar a escolha de modelo

`AI_MODEL_EVALUATIONS_JSON` deve ficar vazio enquanto não houver resultados reais
aprovados. O formato é uma lista de medições com `model`, `task` (`research`),
`dataset`, `evaluatedAt`, `expiresAt`, `cases`, `humanReviewed`, `score`,
`criticalFailures`, `p95Seconds` e `approved`.

A selecção só considera modelos já suportados (`gpt-5-mini`/`gpt-6-astra`), pelo
menos 20 casos todos revistos, pontuação de 90 a 100, zero falhas críticas,
avaliação há menos de 30 dias e validade até 30 dias. Só aparece com acesso
comercial e tarifa válida. São declarações do responsável, não assinaturas de um
avaliador externo. Não preencher com números inventados para desbloquear a opção.

## Validação efectuada sem chamadas pagas

- 245 testes automatizados de aplicação passaram, incluindo reservas, quotas,
  isolamento, autenticação, assinaturas, repetição de eventos, citações, regras e
  selecção medida de modelos.
- 14 conjuntos SQL passaram em PostgreSQL local PGlite, incluindo reinstalação
  020, pesquisa com 1 000 registos fictícios, revogação, auditoria e dump/restauro
  com nova verificação de permissões. Não foi feito restauro na base real.
- TypeScript, lint, build de produção e lockfile fixado validados; auditoria de
  dependências de produção sem vulnerabilidades conhecidas no momento da consulta.
- Verificação pelo navegador: PDF fictício de duas páginas, texto pesquisável,
  OCR da página digitalizada e imagem original; DOCX fictício com tabela,
  proposta de regra e aplicação à célula indicada, conservando o original.
- Pipeline GitHub incluído para repetir verificações em pushes/PRs, sem chaves
  de IA. A execução remota só pode ser confirmada depois do push.

Repetir localmente: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:sql`,
`pnpm build` e `pnpm audit --prod --audit-level=high`. O build prepara recursos
locais de PDF/OCR. A fixture PDF opcional em `tests/document-fixture.py` é apenas
para QA manual, sem dados de clientes.

## Limites de publicação e recuperação

Aplicar 020 não altera a configuração comercial. Aprovação Stripe, facturação,
condições, tarifas e câmbio continuam sujeitos à lista de lançamento existente.
Guardar um estado «revisto» não substitui revisão por jurista.

Antes de migrar a base real, confirmar um backup recuperável. Se for necessário
recuar a aplicação, voltar ao deployment anterior, deixando as tabelas adicionais
intactas; não eliminar tabelas ou dados para reverter a interface. Desactivar
`AI_EXECUTION_ENABLED` impede novas etapas pagas, mas não cancela trabalho que o
fornecedor já recebeu. O webhook deve continuar a recusar/repetir enquanto a
execução estiver pausada; não marcar manualmente pedidos incertos como gratuitos.
