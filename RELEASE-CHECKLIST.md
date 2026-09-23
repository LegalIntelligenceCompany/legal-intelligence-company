# LIC — estado de preparação, 22/09/2026

## Actualização de 23/09 — todos os consumidores com carteira

- As secções históricas abaixo descrevem versões anteriores. Nesta versão, `/api/assistant`, `/api/analyse` e `/api/transcription` também usam reserva comercial antes da chamada e comprovativos antes da liquidação. O acesso de teste permanece isolado.
- Migração 015 acrescenta tarifação separada do áudio. `/setup/metering` reúne 013–015. Não cria saldo nem activa compras. Confirmar instalação no deployment.
- O cliente confirma carteira e reserva máxima; o servidor revalida subscrição, pertença e saldo. O débito continua agregado a 3×, com câmbio versionado, e é idempotente. Falhas sem comprovativo conservam a reserva; não se inventa custo zero.
- `AI_COMMERCIAL_TARIFFS_JSON` passa a exigir também `document` (2 etapas sem web), `assistant-research` (2 etapas com web), `analysis` (3 etapas, web só na segunda) e `transcription` (1 etapa, com `audioInputNanoUsd`). Falta definir e verificar tarifas/limites de produção; não usar fixtures.
- `/setup/launch` é reservado ao titular e reúne verificações de configuração e o guia de registo, fiscalidade, condições e activação. Não certifica conformidade nem aprovação Stripe.
- BLOQUEIOS REAIS: Stripe live não aprovada; regime de IVA/facturação não definido; condições/privacidade/créditos não aprovados; tarifas e limites de produção não validados; ensaio comercial ponta a ponta pendente. Não declarar o site pronto a vender ou apenas dependente de registo.
- Documentos e transcrições síncronos não têm recuperação durável da resposta após perda de ligação; análises concluídas são guardadas. Não prometer recuperação universal.

## Alterações desta versão

- Identidade original em `public/brand/lic-original.png`, enquadrada por CSS; cores, tipografia, cartões e apresentação adaptável.
- Pesquisa pública em `/api/research`: criação assíncrona, consulta por identificador, recuperação após recarregar, revisão exclusiva por comparação atómica de estado. Não repete gerações perante resposta incerta.
- Económico: GPT-5 mini pesquisa e revê com web. Avançado: GPT-5 mini pesquisa; GPT-6 Astra revê o material recebido, SEM consultar novamente as fontes. A interface e o relatório explicitam esta limitação.
- Citações do revisor avançado têm de referenciar IDs da pesquisa original. Isto rejeita URLs novas, mas não demonstra suporte semântico nem elimina alucinações. A avaliação por jurista continua necessária.
- GPT-6 Astra: disponibilidade consultada antes da reserva; entrada limitada a 95 kB UTF-8, saída a 12 000 tokens, sem ferramentas que ampliem o contexto, sem retries automáticos.
- Piloto: autorização total de 10 €, não 10 € adicionais. Migração 011 preserva reservas e data de expiração. Reserva económica 1,50 €, avançada 4,50 €. Não constitui medição de facturação; não cobre outras aplicações na mesma conta API.
- Aliases conhecidos acompanham actualizações do fornecedor dentro da família. Não há descoberta/activação cega de famílias novas nem promessa de melhoria automática de qualidade.

## Publicação

1. Executar 010_research_jobs.sql e 011_pilot_total_10.sql no projecto Supabase já preparado com 009. Não apagar pedidos/reservas antigos.
2. Publicar esta versão na Vercel, mantendo credenciais apenas no servidor e interruptores de execução existentes.
3. Confirmar o limite e reserva real em `/setup/pilot`. O modo avançado deve falhar sem gastar se o modelo não estiver acessível à chave.
4. Fazer uma pergunta pública fictícia no modo escolhido, confirmar passagem de pesquisa a revisão, resposta final com fontes e recuperação sem nova reserva. Conferir manualmente as fontes e logs.

## Privacidade e recuperação

O modo background usa store:false, mas depende de retenção temporária pelo fornecedor (aproximadamente dez minutos). A janela de recuperação de cada etapa é oito minutos. A revisão é iniciada quando a página consulta o estado; fechar a página não cria um trabalhador permanente. Reabrir dentro da janela permite continuar. Não há reinício automático após expiração.

Pedidos e respostas locais ficam acessíveis por 24 horas, apenas ao dono através de servidor autenticado. Registos expirados são eliminados no próximo POST desse dono; não há limpeza programada, pelo que a retenção física pode ser maior que 24 horas. Não usar material confidencial nesta pesquisa pública. Documentos privados não foram migrados para este fluxo.

## Evidência local

- TypeScript, lint, testes de rotas/componentes e compilação de produção.
- PostgreSQL/PGlite: migrações repetíveis, papéis de navegador sem acesso, exclusividade de pesquisa/revisão, conservação de reservas, concorrência no limite de 10 €.
- Navegador: página inicial em desktop e 390 px. Estes testes não demonstram qualidade jurídica nem substituem ensaio real na versão publicada.

## Bloqueios para lançamento comercial

### Ligação comercial — implementação de 23/09/2026 (desactivada por defeito)

- Migrações **013 e 014**: carteira live separada do sandbox, reservas atómicas, comprovativos imutáveis por etapa, débito idempotente e encomendas de financiamento. Não criam saldo, não alteram o piloto e não fazem chamadas externas. `/setup/metering` apresenta ambas para instalação pelo titular. Exigem 001 e 010.
- `/credits` e `/api/live-credits`: subscrições 49/99 EUR + IVA, zero crédito incluído; carregamentos de 1–500 EUR antes de IVA; três lugares por empresa; portal de gestão/cancelamento. A assinatura é validada novamente antes de cada pesquisa e carregamento. Pedidos de Checkout usam uma chave estável para recuperar falhas sem duplicar a compra.
- `/api/live-credits/webhook`: segredo próprio, rejeita sandbox, reconsulta os pagamentos e confirma moeda, montante, titular, impostos e reembolsos. Credita uma vez mesmo com retorno + webhook concorrentes. Reembolsos/disputas congelam a carteira e eventos antigos não a desbloqueiam.
- `/api/research`: reserva o limite apresentado ao cliente antes do fornecedor, guarda o consumo de pesquisa e revisão, liquida 3× custo agregado convertido em EUR e só depois entrega o resultado. Recuperar a mesma resposta não gera nova cobrança. Uso incerto fica reservado para reconciliação, sem repetição automática. Outros serviços continuam no piloto: **não estão comercialmente ligados à carteira**.
- Activação continua bloqueada: `AI_COMMERCIAL_ENABLED=false` e `LIC_LIVE_CHECKOUT_ENABLED=false` por defeito. Não foram alteradas chaves, criados pagamentos live ou aumentados os 10 EUR autorizados do piloto.
- Configuração necessária: chave live, preços live `STRIPE_LIVE_INDIVIDUAL_PRICE_ID`/`STRIPE_LIVE_BUSINESS_PRICE_ID`, assinatura `STRIPE_LIVE_CREDITS_WEBHOOK_SECRET`, registos fiscais/código de imposto `STRIPE_LIVE_CREDITS_TAX_CODE` verificados, `LIC_LIVE_TAX_READY`, condições efectivamente aprovadas/publicadas em `LIC_LIVE_TERMS_URL` e versão `LIC_LIVE_TERMS_VERSION`. Usar eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created` no destino live. O webhook continua a processar pagamentos iniciados mesmo se novas compras forem desactivadas.
- `AI_COMMERCIAL_TARIFFS_JSON` requer `economical` e `advanced`, cada uma com duas etapas `StageBudget` (ver `lib/inference-cost.ts`), `exchange` versionado e `providerInputBoundsReviewed:true`. Usar modelos exactos/snapshots, tarifas oficiais revistas e limites máximos agregados de entrada realmente garantidos pelo fornecedor, incluindo ferramentas. Não copiar os valores sintéticos dos testes. Sem esta validação o consumo comercial deve ficar desligado. `AI_EXECUTION_ENABLED` continua a ser o interruptor geral.
- Não há garantia de lucro líquido: comissões Stripe, câmbio, impostos, disputas, falhas e reembolsos continuam a exigir cobertura e acompanhamento. Não existe reconciliação automática de reservas sem comprovativo nem promessa de todos os serviços prontos a vender.

### Motor de contabilização — base de 23/09/2026

- `lib/inference-cost.ts` lê consumo terminal da Responses API, contabiliza entrada, cache, saída (incluindo raciocínio, sem o contar duas vezes) e chamadas de pesquisa. Rejeita consumo ausente, inconsistente, ferramentas/modalidades não suportadas e preços de contextos não cobertos.
- Tarifas e câmbio são snapshots explícitos, versionados e com validade. Não há preços de produção nem câmbio predefinidos neste módulo. A correspondência de modelo e escalão é exacta; uma alteração de alias exige resolução/verificação antes de gerar. Os valores usados nos testes são sintéticos, não uma tabela comercial.
- Agrega todas as etapas em precisão inteira antes de converter e arredondar o débito de 3× ao cêntimo, sem IVA. O custo em micros é apenas um campo informativo arredondado; não deve ser novamente multiplicado/arredondado para cobrar ao cliente.
- `lib/inference-settlement.ts` prepara a sequência reserva → fornecedor → comprovativo de consumo → acerto. Saldo insuficiente, pedido repetido ou reserva não confirmada impedem o fornecedor. Falhas incertas conservam a reserva, sem repetição automática nem acerto artificial a zero. Saldo sandbox nunca financia um fornecedor live.
- O adaptador durável e a ligação ao chat encontram-se agora implementados como descrito acima. Tarifas/câmbio aprovados, limites de entrada do fornecedor e contabilização específica de áudio permanecem condições de activação, não pressupostos escondidos.
- Verificação local: testes unitários de custo, integração simulada do fluxo de pesquisa e SQL transaccional de 013/014. Zero chamadas pagas de IA ou pagamentos reais. Estes testes não substituem a configuração e validação do deployment.

### Carteira automática em sandbox — actualização 012

- `/setup/credits` permite à conta de configuração abrir carteiras Individual/Empresas, subscrever os preços aprovados em TESTE, comprar saldo avulso (montante livre de 1 a 500 EUR por operação de teste), consultar movimentos e gerir/cancelar a subscrição no portal Stripe. Não activa cobranças reais.
- `/api/credits/webhook` valida assinatura própria (`STRIPE_CREDITS_WEBHOOK_SECRET`) e rejeita eventos live. Reconsulta a Stripe; só credita sessões completas, pagas, em EUR, com titular, encomenda e montante exactos. O retorno do Checkout também reconcilia. SQL transaccional impede duplicação entre retorno, reentregas e concorrência. Não é preciso carregar em Actualizar estado: a página consulta a cada 15 segundos enquanto visível.
- SQL 012 mantém carteiras TESTE separadas do piloto e dos consumidores reais. Renovação de acesso atribui ZERO créditos. Três lugares por empresa são atribuídos pelo titular entre membros confirmados; remoção da organização bloqueia novas reservas imediatamente. Reservas bloqueiam saldo antes do consumo, acertam 3× custo agregado e libertam apenas a diferença conhecida. Não há libertação automática por timeout incerto.
- Reembolsos/disputas congelam a carteira; não existe desbloqueio automático por eventos pagos atrasados. Acertos financeiros/reembolsos reais exigem revisão, não uma falsa garantia de risco zero.
- Simulação fixa de consumo: reserva 60 cêntimos e liquida 30 cêntimos por custo fictício de 100000 milionésimos de EUR. Não chama fornecedores. As rotas de IA existentes continuam exclusivamente no piloto autorizado: **esta carteira ainda não está ligada a inferência real**.
- Antes de produção: integrar medição/limites de custo e câmbio dos fornecedores em TODOS os serviços, validar preços e dados fiscais para cobrar IVA correctamente, aceitar termos e política de créditos, configurar Stripe live e avaliar segurança/privacidade. Não basta mudar uma variável ou trocar chaves. Não se declara o pedido de lançamento comercial concluído.
- Configuração única: aplicar 012 no Supabase, criar os preços em `/setup/plans`, registar destino `/api/credits/webhook` com eventos listados em `/setup/credits/install`, guardar o segredo próprio na Vercel e publicar. Não executar 012 de novo para repor saldos: a repetição preserva dados.
- Testes: `tests/sql-prepaid.mjs` valida migração repetida, três lugares, isolamento, permissões, créditos duplicados, reservas concorrentes, acerto idempotente, cancelamento e congelamento. `tests/prepaid.test.mjs` valida pagamentos, assinatura, autenticação, limites e falhas. Estes testes locais não substituem um Checkout sandbox real e as respectivas notificações no deployment.

### Catálogo aprovado em 22/09/2026

- LIC Individual: 49 EUR/mês, preço base, 1 utilizador.
- LIC Empresas: 99 EUR/mês por empresa, preço base, 3 utilizadores com créditos partilhados (não 99 EUR por lugar).
- IVA acresce quando aplicável. `tax_behavior=exclusive` não configura registos fiscais nem activa cálculo/cobrança automática de impostos.
- `/setup/plans` está restrito à conta de configuração confirmada; permite consultar/criar os dois preços na Stripe TESTE por lookup keys versionadas. Repetições reutilizam os preços; conflitos de montante, moeda, imposto, lugares ou periodicidade bloqueiam a operação. O plano antigo não é alterado.
- Modelo aprovado: as mensalidades são apenas acesso à plataforma, com zero créditos de IA incluídos. Consumo adquirido separadamente e antecipadamente, sem saldo negativo nem carregamentos automáticos. Renovar a mensalidade não deve atribuir saldo de IA.
- Multiplicador aprovado: 3× o custo dos fornecedores em EUR, antes de IVA. `quoteAIConsumption` recebe custo agregado em milionésimos de euro e arredonda o total do pedido por excesso ao cêntimo; não desconta saldo nem autoriza chamadas. Agregar modelos, revisão, pesquisa e outras ferramentas antes do arredondamento. Nunca tratar USD como EUR. Falta integrar tarifas versionadas, conversão cambial e contabilização real dos fornecedores; a margem não é lucro líquido garantido.
- Não há checkout comercial nem saldo utilizável em IA nesta fase. A carteira e os carregamentos automáticos estão implementados em sandbox conforme a secção acima. A validade e as condições dos créditos comerciais continuam por definir.
- Antes de activar consumo comercial: confirmar pagamentos no servidor, creditar cada pagamento uma única vez, reservar atomicamente o custo máximo antes de chamar fornecedores, ajustar ao consumo real, impedir concorrência acima do saldo e definir tratamento de falhas, reembolsos e disputas. A mensalidade isolada nunca autoriza inferência. Custos de fornecedores continuam a ser facturados à plataforma; pré-pagamento não elimina comissões, impostos, disputas ou risco operacional.
- Após publicar, abrir `/setup/plans` e criar/confirmar os dois preços de teste. Não é necessária migração SQL nova: usa o bloqueio da migração 006 já instalada. Nenhuma operação desta página chama a IA.

- Stripe continua em sandbox; não existem permissões de IA para clientes pagantes em produção. Não basta trocar chaves.
- Preços/quotas comerciais, facturação e requisitos fiscais/contratuais precisam de definição e validação apropriada.
- Fazer avaliação jurídica representativa, testes reais dos serviços com documentos fictícios e revisão de privacidade antes de aceitar documentos de clientes.
- Análise documental e transcrição mantêm os limites e o fluxo anterior; não se declara que todos os serviços foram validados ponta a ponta.
- Sem monitorização legislativa automática, certificação de anonimização ou garantia de ausência de alucinações.

## Fontes técnicas verificadas

- https://developers.openai.com/api/docs/guides/background
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/pricing

Preços documentados do Astra em contexto curto Standard: USD 10/M entrada e USD 50/M saída. A reserva é uma margem conservadora, não uma tarifa ao cliente. Revisitar preços e limites antes de prolongar o piloto; expiração actual 29/09/2026.
