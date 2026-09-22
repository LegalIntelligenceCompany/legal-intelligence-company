# Serviços jurídicos — implementação e activação

## Sete novos serviços

- `/services/evidence`: mapa de factos alegados, excertos e lacunas a partir de 1–5 PDFs autorizados da mesma organização, até 10 MB combinados. Não decide admissibilidade ou autenticidade de prova.
- `/services/dossier-search`: perguntas sobre o mesmo conjunto limitado de PDFs, com excertos e localização quando legível. Não pesquisa automaticamente toda a biblioteca nem cria um índice persistente.
- `/services/negotiation`: contrato em PDF, objectivos e alternativas de cláusulas para revisão. Não contacta contrapartes nem certifica validade.
- `/services/meeting`: notas/transcrição coladas (até 60 000 caracteres), guiões, perguntas, proposta de acta e tarefas. Não grava reuniões nem cria tarefas/calendários automaticamente. O serviço de transcrição existente pode fornecer o texto; a transferência é manual e explícita.
- `/clauses`: biblioteca pessoal com pesquisa por título/contexto, versões separadas, declaração pessoal de aprovação e notas de utilização. Pode criar uma nova versão a partir de outra; a aprovação é sempre desmarcada no novo rascunho. Não é um arquivo imutável: o proprietário pode eliminar versões. Armazenamento reutiliza RLS e quotas da biblioteca, com a migração 008.
- `/anonymize`: detecção local de e-mails, IBAN PT, números de nove dígitos e termos literais fornecidos pelo utilizador. Selecção humana das substituições e exportação TXT; não faz redação de PDF, OCR ou remoção de metadados. Não garante anonimato; nomes/moradas e outros dados podem não ser detectados.
- `/legislation-compare`: comparação local linha a linha de dois textos, com fontes e datas declaradas pelo utilizador. Preserva linhas repetidas e distingue adições/remoções; não verifica as fontes, vigência ou efeitos jurídicos. Até 40 000 caracteres/600 linhas por versão.

As quatro novas ferramentas de IA mantêm os bloqueios de execução e de pagamentos. Não usam pesquisa web com documentos/notas privados. Os testes de integração simulam o fornecedor: não demonstram qualidade factual de respostas reais. As ferramentas locais não enviam o texto ao servidor nem fazem chamadas pagas; a biblioteca guarda dados no Supabase.

## Transcrição de áudio

`/transcription` disponibiliza carregamento (MP3/MPEG/MPGA, M4A/MP4, WAV, WebM) e gravação pelo microfone com permissão explícita. Limite de envio binário: 3 MB, verificado no cliente e durante a leitura no servidor. Gravação directa limitada a cinco minutos e ao mesmo limite de bytes; ficheiros submetidos são limitados por bytes, não duração. Não inclui gravações longas em partes, transcrição em tempo real, identificação de oradores ou legendas temporizadas.

O áudio pode ser ouvido, descarregado e apagado localmente antes de enviar. O texto é editável e exportável em TXT. Não há armazenamento automático de áudio/transcrição. Saída de página ou troca de conta interrompe gravação e descarta estado. Rever contra o áudio: não é uma transcrição certificada nem uma garantia de fidelidade.

A rota `/api/transcription` autentica a conta, verifica origem, consentimento e bloqueio de pagamentos, valida assinatura do contentor e partilha a reserva/limites `assistant_begin` e `assistant_finish`. Usa `gpt-4o-mini-transcribe`, sem repetição automática e sem pesquisas web. O bloqueio de IA paga mantém-se; não é preciso novo SQL se a migração do assistente já estiver operacional. Os testes usam um fornecedor simulado, sem chamadas reais. Antes de activar comercialmente, validar qualidade, quotas por duração/custo e permissões de produção. A opção de gravação depende do navegador e de HTTPS/localhost.

## Explicador e revisor crítico

`/services/explainer` explica um PDF privado (até 10 MB) em linguagem simples, cláusula a cláusula ou como glossário. Exige organização e documento autorizado, usa só o ficheiro e pede excertos/páginas, preservação de condições e indicação de ambiguidades. Não valida legislação externa nem a segurança de assinatura.

`/services/reviewer` oferece revisão crítica, contra-argumentos e mapa de argumentos. Permite texto público com pesquisa de fontes ou PDF privado sem pesquisa externa. Mudar de modo pede confirmação e desmonta a conversa anterior, evitando transportar contexto privado para a pesquisa. A revisão distingue alegações, provas, pressupostos e conclusões; não prevê êxito judicial. Os dois serviços mantêm consentimento, limites e bloqueio de IA paga existentes. Não exigem novo SQL. Testes locais não equivalem a avaliação factual de respostas reais da IA.

O catálogo em `/services` inclui verificação assistida de referências, comparação de jurisprudência, estudo (cinco formatos), ensino (quatro formatos), redacção de minutas e cronologia de um a cinco PDFs. Estes percursos reutilizam a pesquisa e a segunda revisão existentes, com instruções específicas validadas no servidor. Não são verificadores jurídicos determinísticos nem garantem ausência de erros.

`/library` permite criar dossiers pessoais, guardar notas/relatórios e fontes, guardar directamente respostas públicas do chat, exportar e eliminar. A conversa completa não é gravada automaticamente. PDFs permanecem na área de contratos da organização: não são copiados para dossiers pessoais. A associação de ficheiros a dossiers ainda não está implementada.

`/alerts` guarda temas e relatórios introduzidos pelo utilizador e compara textualmente os dois últimos registos. A consulta com IA é manual em `/services/watch`. Não há tarefas periódicas, notificações ou e-mails automáticos; diferenças entre relatórios não comprovam alterações legislativas.

## Activar o armazenamento

Depois de publicar o código, abrir `/setup/services`, usar “Copiar código SQL completo” e executá-lo no SQL Editor do projecto Supabase correspondente. Inclui `007_library.sql` e `008_clauses.sql`. Se 007 já foi executada, basta aplicar 008; executar ambas também conserva os registos. Confirmar criação, leitura, exportação e eliminação com duas contas diferentes. Limites partilhados: 100 dossiers/temas/cláusulas e 1000 notas/versões por utilizador.

## Custos e estado

Não foram feitas chamadas pagas ou alteradas configurações de produção. O bloqueio existente em `paidAIAccessError()` permanece: subscrições Stripe de teste não autorizam IA paga. Os percursos de IA estão implementados mas não activados comercialmente. Não basta mudar uma chave. Activação exige permissões de produção, preços/limites aprovados e testes de qualidade com orçamento autorizado.

Validação local: TypeScript, ESLint, testes automatizados e build em cópia isolada; PostgreSQL em memória verifica isolamento entre utilizadores, impedimento de notas em dossiers alheios, eliminação em cascata e reaplicação da migração. Não substitui testes na base de dados e no deployment reais.
