# Piloto privado, 5 € totais

Preparação não significa activação nem validação em produção. Não efectuar chamadas reais até executar a migração 009, publicar e confirmar o orçamento em `/setup/pilot`.

- Conta única: legalintelligencecompany@gmail.com, e-mail confirmado e UUID fixado pela migração.
- Duplo interruptor: AI_EXECUTION_ENABLED=true e AI_PILOT_ENABLED=true. Ausentes/false: bloqueado. As subscrições Stripe de teste nunca desbloqueiam IA.
- GPT-5 mini apenas no piloto; as configurações anteriores de modelos não são alteradas. Revisão em duas passagens preservada. Não garante ausência de erros jurídicos.
- Orçamento global único de 500 cêntimos, sem renovação. Reserva atómica com bloqueio da linha antes da primeira chamada. Identificadores repetidos são rejeitados; erros, interrupções e timeouts não devolvem reservas. Sem tentativas automáticas.
- Expiração fixa: 2026-09-29 23:59:59 UTC. Rever preços e limites antes de qualquer extensão. Desligar a execução impede pedidos futuros, não cancela os que já começaram.
- WAV PCM 16 bits, mono/estéreo, até 60 segundos e 3 MB. A duração é validada a partir dos bytes, não de um valor enviado pelo navegador. Outros formatos e gravação directa ficam fora deste piloto.

## Reservas, não despesas medidas

Valores conservadores por tentativa: pesquisa 150 cêntimos, documentos 60, análise 130, transcrição 20. A aplicação não mostra estes valores como factura ou consumo efectivo.

Base de cálculo consultada em 22/09/2026: GPT-5 mini com contexto de 400 mil tokens, $0,25/milhão de entrada e $2/milhão de saída; pesquisa web $0,01/chamada mais tokens. Limitamos cada resposta a 12 mil tokens de saída e dois usos de ferramentas. Consideramos até três inferências de contexto completo por resposta com pesquisa. Duas passagens de pesquisa: $0,688; duas passagens privadas: $0,248; classificação, pesquisa e análise: $0,592. Multiplicador conservador de 2 EUR por USD, com arredondamento para cima, para margem cambial/fiscal.

Transcrição usa gpt-4o-mini-transcribe. Reserva de 0,20 € por ficheiro validado; contexto máximo publicado de 16 mil tokens de entrada e 2 mil de saída e preços de $1,25/milhão de áudio de entrada e $5/milhão de saída fundamentam a margem. Não permite segmentação automática nem repetições.

O limite de 5 € é imposto às **reservas desta aplicação**. A estimativa depende dos preços/limites publicados e não é uma garantia de factura do fornecedor. Não abrange chamadas feitas fora deste piloto, custos já existentes, alojamento ou outros serviços. Recomenda-se chave/projecto OpenAI dedicado e acompanhar a facturação do fornecedor. Os limites mensais do fornecedor não substituem este controlo e podem ter atraso.

Fontes: https://developers.openai.com/api/docs/models/gpt-5-mini ; https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe ; https://developers.openai.com/api/docs/pricing ; https://developers.openai.com/api/docs/guides/spend-limits

## Verificação sem custos

Os testes locais usam fornecedores simulados. Validar autenticação, bloqueio de orçamento e repetição antes de testar com uma pergunta fictícia real. Verificar depois a reserva em `/setup/pilot` e o consumo no projecto do fornecedor. Não activar todos os clientes nem trocar chaves Stripe para produção.
