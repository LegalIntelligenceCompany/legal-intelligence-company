# Escolha de modelos: estado e activação

Implementado: adaptadores de texto Anthropic Messages e Google Gemini generateContent,
catálogo configurável, escolha no chat, revisão com fontes previamente pesquisadas,
reserva pré-paga, comprovativos normalizados e recuperação sem nova geração.
Não significa que todos os modelos existentes estejam integrados ou testados.
As entradas sugeridas ficam desligadas. Não foram efectuados testes pagos.

## Teste único Sonnet autorizado em 23/09/2026

A página `/setup/models` inclui agora um teste separado com conteúdo fictício.
Após publicar, execute apenas `017_claude_pilot.sql` pelo botão dessa secção.
A migração não gera texto nem altera o limite de 10 €. O botão de execução
exige consentimento e reserva atomicamente 100 cêntimos no orçamento existente.
Só há uma tentativa durante toda a vida desta instalação; recarregar, executar
o SQL novamente ou mudar o identificador do pedido não permite repetir.

Usa exclusivamente `claude-sonnet-5`, com no máximo 2 000 tokens de entrada e
600 de saída, sem ferramentas, sem pesquisa OpenAI e sem dados de clientes.
Tarifa de referência consultada em 23/09/2026: $2/$10 por milhão, máximo base
de $0,01 nestes limites; a reserva conservadora é 1 €, não uma factura nem
uma conversão cambial exacta. Expira com o piloto em 29/09/2026.
Fonte: https://platform.claude.com/docs/en/about-claude/pricing

A resposta e contagens ficam guardadas para o titular. Falhas, timeout e perda
de ligação mantêm a reserva; não há repetição automática. O teste avalia somente
uma resposta técnica com material fictício, não qualidade jurídica, pesquisa
completa nem todos os modelos Claude. Não altera `validated`, tarifas comerciais
ou interruptores de pagamentos. A autorização adicional cobre somente este teste
Sonnet, não os restantes fornecedores/modelos.

## Próximo passo do titular

1. Publicar este commit e abrir `/setup/models`.
2. Criar acesso API Anthropic e Google e rever facturação e tratamento de dados.
3. Adicionar `ANTHROPIC_API_KEY` e `GEMINI_API_KEY` na Vercel como segredos
   exclusivamente do servidor. Não enviar chaves por chat ou incluí-las no Git.
4. Configurar `AI_REVIEW_MODELS_JSON`, inicialmente com `validated: false`:

```json
[
  {"id":"review-sonnet","label":"Claude Sonnet","provider":"anthropic","model":"claude-sonnet-5","validated":false},
  {"id":"review-gemini","label":"Gemini Flash","provider":"google","model":"gemini-3.8-flash","validated":false}
]
```

Confirmar IDs exactos e capacidades na conta; aliases cuja versão devolvida difira
da tarifa são recusados. Podem ser adicionadas outras entradas Claude/Gemini
compatíveis (até 100); não se aceitam URLs ou fornecedores arbitrários.

5. Em `AI_COMMERCIAL_TARIFFS_JSON`, cada id necessita de duas etapas com o mesmo
   formato usado pelo contador existente: GPT-5 mini com pesquisa e modelo escolhido
   sem ferramentas. As tarifas devem corresponder ao identificador exacto, tipo de
   processamento, cache, escalão de contexto, limites e datas. Incluir câmbio
   versionado. Não usar preços de outro modelo nem declarar limites revistos sem
   os comprovar. Não há preços comerciais implícitos.
6. Validar a integração e qualidade jurídica em ambiente controlado antes de
   declarar `validated: true`. Isso é uma declaração do titular, não uma avaliação
   automática. Testes reais adicionais exigem orçamento autorizado; este código
   não utiliza nem aumenta o piloto de 10 € para outros fornecedores.
7. A activação comercial permanece condicionada à aprovação de pagamentos,
   termos/privacidade, tarifas, subscrição e saldo. Manter interruptores desligados
   enquanto houver pendências. Não é necessário SQL adicional após a migração 016.

## Limites desta versão

- Pesquisa inicial continua em OpenAI; Claude/Gemini revêem o material, não voltam
  a consultar fontes. A interface e a resposta declaram esta limitação.
- Só perguntas públicas; o consentimento inclui o fornecedor da revisão.
- A chamada de revisão é limitada a 25 segundos, após contagem de tokens; respostas
  truncadas, cache-write, ferramentas inesperadas ou custos não confirmados não são
  aceites silenciosamente. Um timeout pode ter custo: mantém-se a reserva para
  reconciliação e não há repetição automática.
- O modelo exacto fica fixado no plano reservado. Configuração alterada não troca
  silenciosamente o modelo. Respostas já persistidas podem concluir o acerto sem
  nova chamada ao fornecedor.
- Não há troca automática para modelos recém-lançados, nem promessa de ausência
  de alucinações. Os testes locais usam respostas sintéticas, não comprovam qualidade
  de um modelo nem acesso API da conta.

Documentação consultada em 23/09/2026:
- https://platform.claude.com/docs/en/api/messages/create
- https://platform.claude.com/docs/en/models/overview
- https://platform.claude.com/docs/en/api/service-tiers
- https://ai.google.dev/api/generate-content
- https://ai.google.dev/api/tokens
- https://ai.google.dev/api/models
