# Stripe e lançamento da LIC — guia de 25/09/2026

Este guia corresponde ao código desta versão. Não confirma que a conta Stripe, a base de dados publicada ou as variáveis da Vercel já estejam configuradas. Não foram feitas cobranças ou chamadas de IA pagas nesta revisão.

## Primeiro: publicar esta actualização sem abrir vendas

1. Publicar as alterações no GitHub e esperar por **Ready** na Vercel.
2. Entrar como titular e abrir `/setup/recovery`. Copiar o SQL completo 018 para o SQL Editor do projecto Supabase correcto e executar. É repetível; não repõe saldos. Não repetir scripts de orçamento nem desactivar RLS.
3. Na Vercel, projecto LIC → Settings → Environment Variables, criar `CRON_SECRET` em **Production**, com um segredo aleatório de pelo menos 32 caracteres, gerado pelo gestor de palavras-passe. Não colocar no GitHub nem partilhar em mensagens. Fazer novo deployment.
4. Em Settings → Cron Jobs, confirmar a tarefa `/api/maintenance/recovery`: limpeza diária às 03:15 UTC. Confirmar uma execução bem-sucedida nos registos. A Vercel envia o segredo como autorização; configurar a variável não prova que a tarefa executou. [Documentação Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
5. Abrir `/setup/launch`: carteira, recuperação e segredo devem constar como configurados. O resultado só fica acessível por 24 horas; a eliminação física ocorre na consulta posterior ou limpeza diária. Falhas da limpeza podem prolongar a retenção física e devem ser investigadas.
6. Manter `LIC_LIVE_CHECKOUT_ENABLED=false` e `AI_COMMERCIAL_ENABLED=false` até concluir a preparação. Preservar `AI_EXTERNAL_MODELS_ENABLED=false`: Claude/Gemini não são reactivados.

Não continuar a vender num plano inadequado: se a conta ainda for Hobby, a Vercel limita-o a uso pessoal não comercial. Escolher um plano compatível antes do lançamento. Não foi contratado nenhum plano nesta revisão. [Vercel Hobby](https://vercel.com/docs/plans/hobby).

## 1. Activar a conta Stripe de produção

No painel Stripe, sair da área de teste e seleccionar a conta de produção. Completar os requisitos com os dados reais do vendedor, representantes e conta bancária; resolver pedidos de verificação. Activar autenticação de dois factores. Não enviar chaves, documentos de identidade ou IBAN nesta conversa. A Stripe exige verificação para os serviços live. [Activação oficial](https://docs.stripe.com/get-started/account/set-up).

O certificado de admissibilidade do nome não é, por si só, confirmação de todos os dados do vendedor. Usar a entidade e enquadramento efectivamente definidos, não dados provisórios.

## 2. Criar exactamente dois preços mensais

No **Catálogo de produtos → Adicionar produto**, criar os produtos abaixo. Escolher tarifa fixa, recorrente, mensal, EUR e **impostos excluídos**. Não escolher preço por utilizador, preço por uso, escalões ou quantidade ajustável. [Gestão de produtos e preços](https://docs.stripe.com/products-prices/manage-prices).

| Produto | Preço base | Periodicidade | Conteúdo |
|---|---:|---|---|
| LIC Individual | 49,00 € | Cada mês | Acesso individual; créditos comprados à parte |
| LIC Empresas | 99,00 € | Cada mês | Até três utilizadores, incluindo o titular, saldo partilhado; créditos à parte |

Requisitos específicos do código: preços activos e live, quantidade 1, `tax_behavior=exclusive`, `billing_scheme=per_unit`, `usage_type=licensed`, intervalo mensal 1. Os 99 € são pelo plano empresarial inteiro, não 99 € multiplicados por três.

Copiar o identificador `price_...` de cada **preço**, não o `prod_...` do produto. Os identificadores criados em teste não substituem os live. Se um preço estiver errado, criar outro correcto e actualizar a referência da aplicação.

Não criar Payment Links para contornar o site: o checkout precisa de associar o pagamento à carteira. Os carregamentos de 20 €, 50 € e 100 € são criados pelo código; não é necessário criar três preços manuais adicionais. A subscrição não inclui créditos e não há carregamento automático.

## 3. Configurar impostos e facturação

Com o contabilista, confirmar a classificação das subscrições e dos carregamentos pré-pagos, países de venda, clientes particulares/empresas, registos aplicáveis e solução de facturação. O código pressupõe carregamentos com imposto tratado no checkout; se o enquadramento aprovado exigir outro tratamento, é preciso adaptar o código antes de vender.

Na Stripe Tax, confirmar morada fiscal, códigos fiscais dos produtos e registos reais aplicáveis. Não seleccionar registos fictícios nem marcar a confirmação fiscal apenas para desbloquear botões. Os preços da LIC são explicitamente sem impostos; não usar o comportamento automático como substituto. [Configuração Stripe Tax](https://docs.stripe.com/tax/set-up).

O sistema activa `automatic_tax` no checkout. Isso não é uma garantia de cumprimento de todas as obrigações portuguesas de facturação. A solução de facturação e o seu funcionamento ficam dependentes da escolha e validação do responsável/contabilista.

## 4. Criar o destino de eventos live correcto

Em **Workbench → Webhooks → Adicionar destino**, seleccionar eventos da própria conta e destino HTTPS. Usar:

`https://legal-intelligence-company.vercel.app/api/live-credits/webhook`

Seleccionar estes quatro eventos, tratados nesta versão:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`
- `charge.dispute.created`

Guardar o destino e copiar o respectivo segredo de assinatura `whsec_...` para a variável indicada abaixo. Não reutilizar o segredo do webhook de teste. A documentação explica o registo e assinatura dos destinos. [Webhooks Stripe](https://docs.stripe.com/webhooks).

O antigo `/api/billing/webhook` é do fluxo de teste e não substitui este. Não seleccionar todos os eventos como se isso acrescentasse funcionalidades. O estado da subscrição é consultado na Stripe antes de reservar consumo. Reembolsos e disputas podem bloquear a carteira para revisão; não são um processo contabilístico totalmente automático.

## 5. Configurar o portal do cliente

Em **Settings → Billing → Customer portal**, configurar a versão live: permitir actualizar o meio de pagamento, consultar documentos de cobrança e cancelar a subscrição. Para esta versão, usar cancelamento no fim do período e deixar desligadas mudanças de plano, quantidades e ofertas/cupões. Publicar contactos, ligações legais e identidade visual aprovados. [Configurar o portal](https://docs.stripe.com/customer-management/configure-portal).

As restrições de troca/quantidade são específicas da LIC: o plano pessoal e o empresarial correspondem a carteiras diferentes e o preço é validado exactamente. Não activar essas opções sem implementar primeiro uma migração segura.

## 6. Colocar as referências na Vercel

No projecto correcto → Settings → Environment Variables → **Production**:

| Variável | Valor a colocar |
|---|---|
| `STRIPE_SECRET_KEY` | Chave secreta live da conta (`sk_live_...`) |
| `STRIPE_LIVE_INDIVIDUAL_PRICE_ID` | Preço live mensal de 49 € |
| `STRIPE_LIVE_BUSINESS_PRICE_ID` | Preço live mensal de 99 € |
| `STRIPE_LIVE_CREDITS_WEBHOOK_SECRET` | Segredo do novo destino `/api/live-credits/webhook` |
| `STRIPE_LIVE_CREDITS_TAX_CODE` | Código `txcd_...` aprovado para os carregamentos |
| `LIC_LIVE_TERMS_URL` | URL real das condições aprovadas, no domínio da LIC |
| `LIC_LIVE_TERMS_VERSION` | Identificador da versão efectivamente publicada |
| `LIC_LIVE_TAX_READY` | `true` só depois da confirmação fiscal |

Não colocar segredos em variáveis `NEXT_PUBLIC_`. Não copiar live para Preview por conveniência. Fazer novo deployment após guardar.

O código actual fixa o domínio `legal-intelligence-company.vercel.app`. Se adoptar um domínio próprio, actualizar e testar origem, URLs de retorno, condições e webhook antes da mudança; não basta alterar o DNS.

## 7. Aprovação técnica final e abertura

1. Aprovar e publicar dados do vendedor, suporte, condições, privacidade e política de saldo/reembolsos/cancelamento. Resolver o destino de saldo não gasto quando a subscrição termina.
2. Validar `AI_COMMERCIAL_TARIFFS_JSON`, câmbio, validade e limites de cada serviço que ficará disponível. Não inventar tarifas para tornar a lista verde. Não activar modelos externos.
3. Confirmar cópias de segurança, recuperação da base de dados, envio de emails de autenticação e monitorização de falhas. Estes controlos dependem dos serviços alojados, não apenas do código local.
4. Fazer uma validação controlada da configuração live, com autorização específica para qualquer cobrança: associação correcta à carteira, saldo único por pagamento, entrega webhook, reserva, acerto, recuperação e cancelamento. Não usar cartão fictício em produção nem criar transacções artificiais para aparentar sucesso.
5. Só depois ligar `LIC_LIVE_CHECKOUT_ENABLED=true`, `AI_COMMERCIAL_ENABLED=true` e `AI_EXECUTION_ENABLED=true` no ambiente aprovado e fazer deployment. O piloto deve ficar desligado no lançamento comercial (`AI_PILOT_ENABLED=false`).

Os testes automáticos locais usam fornecedores simulados e uma base SQL isolada. Não certificam uma operação live. A recuperação é limitada pelo tempo máximo do servidor; se o servidor ou fornecedor falhar antes de guardar o resultado, não há promessa de recuperação. Nunca se repete automaticamente uma geração para esconder uma falha.

## Operação depois de abrir

Rever `/setup/reconciliation` e entregas falhadas na Stripe. Acertar apenas pedidos com todos os recibos confirmados. Investigar os restantes, sem editar saldos à mão. Manter alertas de custos e tesouraria: o cliente pré-paga à LIC, mas a LIC continua a pagar fornecedores, comissões e infraestrutura. O multiplicador 3,5 não é lucro líquido garantido.
