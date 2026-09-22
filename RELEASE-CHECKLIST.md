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

### Catálogo aprovado em 22/09/2026

- LIC Individual: 49 EUR/mês, preço base, 1 utilizador.
- LIC Empresas: 99 EUR/mês por empresa, preço base, 3 utilizadores com créditos partilhados (não 99 EUR por lugar).
- IVA acresce quando aplicável. `tax_behavior=exclusive` não configura registos fiscais nem activa cálculo/cobrança automática de impostos.
- `/setup/plans` está restrito à conta de configuração confirmada; permite consultar/criar os dois preços na Stripe TESTE por lookup keys versionadas. Repetições reutilizam os preços; conflitos de montante, moeda, imposto, lugares ou periodicidade bloqueiam a operação. O plano antigo não é alterado.
- Não há checkout comercial nem atribuição de saldo nesta fase. Quantidade/validade dos créditos e carregamentos continuam por definir e implementar. Metadados de três lugares não substituem controlo de membros nem uma carteira partilhada atómica.
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
