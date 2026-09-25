# Preparação de lançamento — actualização de 25 de Setembro de 2026

## Revisão de 25/09

- Recuperação opcional, com consentimento explícito, dos resultados do assistente documental e da transcrição durante 24 horas. Não copia áudio, PDFs ou perguntas; o resultado pode conter dados provenientes do material, pelo que continua a ser conteúdo sensível.
- Resultados validados são guardados antes do acerto financeiro. Pedidos incertos não são reenviados automaticamente. O mecanismo não garante recuperação se o servidor terminar antes de guardar o resultado.
- Consulta autorizada por conta e nova verificação de acesso à organização/documentos. Limpeza de expirados na consulta e tarefa diária protegida por segredo.
- Acerto administrativo para pedidos com todos os recibos confirmados; casos com recibos em falta mantêm a reserva e exigem investigação.
- 207 testes da aplicação e 12 suites SQL passaram; lint e build de produção passaram. Sem chamadas pagas, cobranças reais ou alteração de configuração remota.
- Verificação local no navegador: página de recuperação legível, botão responde com pedido de autenticação sem sessão e não expõe resultados. Recuperação autenticada e controlo de acesso verificados com testes simulados, não com dados de clientes em produção.
- Publicar o código, instalar apenas a nova migração 018 em `/setup/recovery`, configurar `CRON_SECRET` e confirmar execução da limpeza na Vercel. Os passos completos e as pendências comerciais estão em [STRIPE-LANCAMENTO.md](STRIPE-LANCAMENTO.md).
- Comparação documentada e prioridades de produto em [COMPARACAO-MERCADO.md](COMPARACAO-MERCADO.md). Não é uma certificação de superioridade.

As notas de 24/09 abaixo são históricas. As duas limitações de recuperação e acerto exclusivamente consultivo foram parcialmente resolvidas acima; continuam pendentes validação remota, consumos sem recibos e aprovação comercial.

## Alterações desta revisão

- Conta com saída de sessão, destinos de login limitados e administração reservada ao titular confirmado.
- Ajuda técnica, histórico dos últimos 100 pedidos do próprio utilizador e consulta administrativa de reservas pendentes.
- Consulta de carteiras e gestão/cancelamento de subscrições independentes da autorização de novas compras. Compras continuam bloqueadas pela configuração existente.
- Cabeçalhos de segurança, textos condicionados aos modelos e ao financiamento disponíveis, aviso ao sair de ferramentas com trabalho não exportado.
- Reparação da migração 005 do assistente, anteriormente inválida. Sem reposição de quotas ou saldos e sem eliminação de dados.

## Publicação destas alterações

1. Publicar os ficheiros do repositório e aguardar o deployment Ready na Vercel.
2. O titular pode abrir `/setup/assistant` e executar o SQL completo corrigido no projecto Supabase correspondente. É repetível; não repetir outros scripts de orçamento. A alteração local de um ficheiro SQL não altera a base de dados publicada.
3. Confirmar entrada/saída em `/settings`, acesso ao histórico em `/usage` e bloqueio de `/setup/launch` para uma conta que não seja o titular.

Não foram activados pagamentos, alteradas chaves, aprovadas tarifas nem efectuadas chamadas de geração pagas nesta revisão.

Validação local: 198 testes da aplicação passaram; todas as 11 suites SQL isoladas passaram; lint e build de produção passaram. No navegador, ajuda acessível, histórico protegido por autenticação e páginas de instalação bloqueadas sem sessão de titular. Não foi feita validação paga nem publicação desta versão durante estes testes.

## Não é ainda autorização de lançamento comercial

Faltam confirmação do vendedor e contactos, conta Stripe live aprovada, enquadramento fiscal/facturação, condições de venda e política de privacidade aprovadas, tarifas/câmbio válidos e configuração de produção. O certificado de admissibilidade do nome não satisfaz esses controlos técnicos.

Limitações técnicas mantidas e que exigem validação antes de abrir ao público:

- Documentos/transcrições não têm recuperação persistente de resultados: o aviso de saída não substitui armazenamento e não impede encerramento forçado. A pesquisa jurídica tem recuperação própria; análises guardadas mantêm o mecanismo existente.
- A reconciliação administrativa é uma consulta, não resolve automaticamente consumos incertos. Não libertar reservas sem recibos confirmados.
- Testes locais com fornecedores simulados não comprovam entregas reais, facturação, qualidade jurídica ou disponibilidade de modelos em produção. É necessário um teste final controlado quando as configurações aprovadas existirem.
- Contactos de apoio, tratamento de pedidos sobre dados e documentos legais têm de ser definidos pelo responsável. A página Ajuda não é uma política de privacidade.

Claude e Gemini permanecem sujeitos aos interruptores de configuração existentes; esta revisão não os reactiva.
