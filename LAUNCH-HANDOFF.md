# Preparação de lançamento — 24 de Setembro de 2026

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
