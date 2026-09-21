# Serviços jurídicos — implementação e activação

## Explicador e revisor crítico

`/services/explainer` explica um PDF privado (até 10 MB) em linguagem simples, cláusula a cláusula ou como glossário. Exige organização e documento autorizado, usa só o ficheiro e pede excertos/páginas, preservação de condições e indicação de ambiguidades. Não valida legislação externa nem a segurança de assinatura.

`/services/reviewer` oferece revisão crítica, contra-argumentos e mapa de argumentos. Permite texto público com pesquisa de fontes ou PDF privado sem pesquisa externa. Mudar de modo pede confirmação e desmonta a conversa anterior, evitando transportar contexto privado para a pesquisa. A revisão distingue alegações, provas, pressupostos e conclusões; não prevê êxito judicial. Os dois serviços mantêm consentimento, limites e bloqueio de IA paga existentes. Não exigem novo SQL. Testes locais não equivalem a avaliação factual de respostas reais da IA.

O catálogo em `/services` inclui verificação assistida de referências, comparação de jurisprudência, estudo (cinco formatos), ensino (quatro formatos), redacção de minutas e cronologia de um a cinco PDFs. Estes percursos reutilizam a pesquisa e a segunda revisão existentes, com instruções específicas validadas no servidor. Não são verificadores jurídicos determinísticos nem garantem ausência de erros.

`/library` permite criar dossiers pessoais, guardar notas/relatórios e fontes, guardar directamente respostas públicas do chat, exportar e eliminar. A conversa completa não é gravada automaticamente. PDFs permanecem na área de contratos da organização: não são copiados para dossiers pessoais. A associação de ficheiros a dossiers ainda não está implementada.

`/alerts` guarda temas e relatórios introduzidos pelo utilizador e compara textualmente os dois últimos registos. A consulta com IA é manual em `/services/watch`. Não há tarefas periódicas, notificações ou e-mails automáticos; diferenças entre relatórios não comprovam alterações legislativas.

## Activar o armazenamento

Depois de publicar o código, abrir `/setup/services`, copiar o SQL e executá-lo no SQL Editor do projecto Supabase correspondente. Corresponde a `supabase/migrations/007_library.sql`. É repetível e independente das migrações de IA. Confirmar criação, leitura, exportação e eliminação com duas contas diferentes. Limites: 100 dossiers/temas e 1000 notas por utilizador.

## Custos e estado

Não foram feitas chamadas pagas ou alteradas configurações de produção. O bloqueio existente em `paidAIAccessError()` permanece: subscrições Stripe de teste não autorizam IA paga. Os percursos de IA estão implementados mas não activados comercialmente. Não basta mudar uma chave. Activação exige permissões de produção, preços/limites aprovados e testes de qualidade com orçamento autorizado.

Validação local: TypeScript, ESLint, testes automatizados e build em cópia isolada; PostgreSQL em memória verifica isolamento entre utilizadores, impedimento de notas em dossiers alheios, eliminação em cascata e reaplicação da migração. Não substitui testes na base de dados e no deployment reais.
