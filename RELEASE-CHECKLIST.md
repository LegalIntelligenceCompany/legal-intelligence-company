# LIC — estado de preparação, 22/09/2026

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
