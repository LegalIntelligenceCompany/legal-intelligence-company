# Verificação operacional — 26/09/2026

Base publicada observada: `8e9acaf`. As alterações desta entrega só ficam online
depois de commit/push e deployment Ready. Este documento regista evidência, não
certificação jurídica, auditoria independente nem autorização de venda.

## Alterações desta entrega

- Limpeza: registo estruturado `lic.recovery.cleanup` com conclusão/falha, duração
  e contagens. Não regista conteúdo, identificadores de clientes ou segredos.
  Mantém a autorização CRON e a eliminação apenas de resultados expirados e
  auditoria com mais de 90 dias. Falhas continuam a devolver HTTP 503.
- `/setup/workspace`: contagens de resultados expirados e notificações por tratar
  há mais de cinco minutos, indicação do segredo de limpeza e orientação para
  consultar o resultado real da execução. Erros de consulta não aparecem como
  ausência de problemas. A página não executa limpeza nem gera IA.
- Verificação pública: `pnpm check:published`, dez pedidos GET/HEAD, no máximo
  dois em simultâneo, sem credenciais, sem geração e sem pagamentos. Verifica
  login, protecções HTTP, recusa de acesso anónimo e recursos PDF/OCR.
- GitHub Actions: `Disponibilidade pública LIC`, agendado a cada seis horas,
  além de execução manual. Só se activa quando este ficheiro chegar à branch
  predefinida e Actions estiver permitido. As notificações de falhas dependem
  das preferências GitHub do titular. Não substitui um serviço de monitorização
  com SLA nem testa percursos autenticados.
- Configuração TypeScript: removida a inclusão de tipos de um build temporário
  antigo que podia conflituar com os tipos do build corrente. Saídas temporárias
  de builds não entram em Git nem no lint.

## Evidência recolhida

| Verificação | Resultado e alcance |
| --- | --- |
| Testes de aplicação | 249 testes passaram na execução final, incluindo quatro testes novos de limpeza e monitorização. Não chama fornecedores pagos. |
| Base de dados | 14 suites SQL passaram em PGlite: permissões, isolamento, revogação, concorrência, quotas, reservas, débitos e repetição de notificações. |
| Restauro | Dump/restauro de dados fictícios numa instância isolada passou, com nova verificação das permissões. Não foi restaurada uma cópia da base real. |
| Pesquisa com dados sintéticos | Pesquisa sobre 1 000 registos fictícios e limite de resultados validada localmente. Não mede capacidade de produção. |
| Site publicado | Dez verificações públicas passaram; respostas protegidas 401/403, login e recursos PDF/OCR 200. Não enviou formulários, cookies ou gerações. |
| Dossiers no site publicado | Criado um dossier privado `QA técnico LIC — 26-09-2026`, com um registo fictício e uma revisão. Após recarregar, ambos foram recuperados; a pesquisa global autorizada encontrou os dois. O original foi conservado. Não houve partilha nem IA. Ficou guardado para conferência do titular. A introdução da data pelo controlo automático não foi confirmada; não contar este ensaio como validação do campo de data. |
| Build | Build de produção concluído. Tipos e lint verificados. Auditoria das dependências de produção não reportou vulnerabilidades conhecidas nesta consulta. |
| Notificações de pesquisa | Duas entregas assinadas de uma pesquisa existente apareciam tratadas; resultado concluído recuperável ao reabrir o chat. Não prova o cenário de fechar a página durante o processamento. |
| Orçamento | Painel publicado: limite 10 €, reservado 10 €, disponível 0 €. Reserva não equivale a custo efectivamente facturado. Nenhuma chamada paga feita nesta entrega; limite não alterado. |
| Supabase Security Advisor | Painel: zero erros, 14 avisos. Entre os avisos visíveis, funções SECURITY DEFINER executáveis por utilizadores autenticados. Estas funções são intencionais e exigem verificações internas; não revogar permissões indiscriminadamente nem interpretar zero erros como certificação de segurança. |
| Backups reais | Painel Supabase: plano Free, sem backups do projecto incluídos. Não foi contratado upgrade nem exportada a base real. |

## Etapas que não foram concluídas — motivo exacto

1. **Limpeza no ambiente publicado:** `CRON_SECRET` estava em falta. Formulário
   Vercel preparado em Production; o titular deve introduzir um segredo aleatório
   de pelo menos 32 caracteres, guardar e publicar. Confirmar depois a execução
   em Cron Jobs → View Logs. Não basta aparecer «configurado». Não foi executada
   eliminação manual de dados reais durante esta verificação.
2. **Pesquisa com página fechada e transcrição real:** não executadas porque o
   orçamento autorizado está completamente reservado. Não libertar reservas
   incertas, repetir o SQL ou aumentar o limite para contornar esta protecção.
   Um novo ensaio pago requer autorização e orçamento disponível.
3. **PDF/OCR e Word no deployment actual:** a abertura do ficheiro fictício pelo
   navegador não foi autorizada. Os testes de código e disponibilidade dos
   recursos passaram, mas não equivalem a uma nova validação visual ponta a ponta.
   Os ensaios manuais anteriores estão documentados em `TECHNICAL_WORKSPACE.md`.
4. **Duas contas no site real:** falta uma segunda conta de teste confirmada. Os
   testes SQL verificaram isolamento e revogação em dados fictícios; não foram
   usados dados nem credenciais de outros clientes. Não criar contas fictícias
   em nome de pessoas reais nem desactivar RLS para efectuar este ensaio.
5. **Backup real e restauro isolado:** falta configurar um destino de backup e
   acesso de operação, ou aprovar o plano de backup do fornecedor. Preservar
   também os ficheiros de Storage; um dump da base não contém os respectivos
   objectos. Nunca testar o restauro por cima da produção. Medir perda máxima
   de dados e tempo de recuperação num ensaio separado.
6. **Pagamentos ponta a ponta publicados:** testes simulados de carteira e
   notificações passaram; continuam pendentes Stripe live, preços, fiscalidade,
   condições, tarifas e câmbio. Não foram activadas compras, consumo comercial,
   fornecedores externos ou carregamentos automáticos.

## Procedimento de aceitação, sem repetir testes indiscriminadamente

- Publicar esta entrega e verificar o commit correcto na Vercel.
- Confirmar **uma** execução diária da limpeza e ausência de falhas nos logs.
- Com duas contas de teste, criar um dossier fictício na primeira, confirmar
  que a segunda não o lê, partilhar explicitamente e verificar apenas o acesso
  aprovado, revogar e confirmar que deixa de abrir. Exige autorização para
  partilhar no momento da operação; não usar dossiers reais como teste.
- Quando existir orçamento aprovado, fazer **uma** pesquisa económica, fechar
  todas as páginas do chat durante o processamento, verificar os eventos
  tratados e recuperar o resultado. Conferir que houve apenas uma reserva.
- Abrir um PDF fictício de duas páginas (uma digitalizada), pesquisar a página
  textual, executar OCR na digitalizada, conferir contra a imagem e exportar.
  Abrir DOCX fictício com tabela, aprovar uma alteração e verificar o Word
  exportado. Não confundir OCR ou alterações literais com revisão jurídica.
- Confirmar um backup real e restaurá-lo num ambiente isolado, incluindo
  permissões e Storage. Só então registar o restauro de produção como validado.

Referências consultadas: [OpenAI webhooks](https://developers.openai.com/api/docs/guides/webhooks),
[Vercel Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs) e
[Supabase backups](https://supabase.com/docs/guides/platform/backups).
A orientação OpenAI Docs foi usada para validar o alcance das notificações,
sem alterar modelos ou fazer novas chamadas pagas.
