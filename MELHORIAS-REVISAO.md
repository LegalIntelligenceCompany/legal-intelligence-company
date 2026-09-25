# Revisão, evidência e avaliação — 25/09/2026

## Actualização técnica: chat, fontes, exportação e dossiers

Esta secção descreve a versão mais recente e substitui as limitações anteriores relativas a tabelas Word, histórico da pesquisa e limpeza dos pedidos de pesquisa.

- Chat: histórico pesquisável de até 50 pesquisas não expiradas, recuperação por identificador e seguimento com até dois pares de perguntas/respostas. O contexto é obtido no servidor e pertence à conta autenticada; o cliente não pode injectar o histórico de outra conta. Mantém-se a retenção de 24 horas, sem alargamento silencioso.
- Acompanhamento com etapas reais e tempo decorrido. Falhas de comunicação bloqueiam novo envio até recuperar; não há repetição automática de geração paga. A resposta final aparece depois da revisão, não é streaming de um rascunho por validar. O pedido ao servidor tem limite de espera; atingir esse limite não cancela a geração no fornecedor.
- Fontes: citações junto do trecho, numeração coerente no ecrã e nas exportações e painel com os parágrafos associados. URLs inseguras e intervalos inválidos são rejeitados. “Domínio oficial” classifica o endereço, não certifica a afirmação. O trecho mostrado é da resposta, não um excerto recolhido da fonte. Não implementa verificação semântica automática nem certificação da vigência.
- Exportação das respostas e dossiers para Word editável, cópia de texto e pré-visualização A4 para imprimir/guardar como PDF. Texto não fiável é escapado; não é executado como HTML.
- Word: importação local de parágrafos **e tabelas**, revisão por célula/parágrafo e exportação com alterações registadas, preservando a estrutura. Continua sem aceitar imagens no corpo, campos, macros, ligações externas e revisões preexistentes; não promete compatibilidade com qualquer DOCX.
- PDF: consulta do original dentro do contrato, com indicação da página física e acesso pelo armazenamento autenticado. Sem URL pública. Não inclui OCR, extracção local de texto ou prova de que a IA leu todas as páginas. A apresentação depende do suporte PDF do navegador; permanece a descarga do documento.
- Dossiers: pesquisa de título/contexto, pesquisa de conteúdo/fontes sem acentos, filtros de referências/documentos/revisões, alteração de título/descrição e ligação a documentos existentes. Guardar a referência exige confirmação da divulgação do nome aos membros do dossier e não concede acesso ao ficheiro. Renomear e eliminar uma nota não apaga o rascunho de outra nota.
- A limpeza programada existente também remove pesquisas expiradas. Continua a depender de `CRON_SECRET` e da execução da tarefa no deployment; o código não prova que a configuração real está activa.

### Publicação desta actualização

Não acrescenta migração SQL, dependências, tarifas, modelos activos ou pagamentos. Pressupõe as migrações anteriormente instaladas. Fazer Push origin do commit desta alteração e aguardar Ready na Vercel. Não repetir SQL para publicar estas melhorias.

### Verificação desta actualização

- Testes de autenticação, isolamento, recuperação, continuação, não repetição de geração, citações, exportação e pesquisa local; TypeScript, lint e compilação de produção.
- Testes SQL de partilha: leitura/edição, autoria, versões, revogação, saída da equipa, isolamento e repetibilidade.
- Navegador local: tabela DOCX fictícia importada, célula editada e ficheiro descarregado. Inspecção do DOCX confirmou tabela preservada e elementos de inserção/eliminação com autoria. Não foi feita validação no Microsoft Word.
- Nenhuma chamada paga de IA nem cobrança. Falta o ensaio autenticado da nova versão publicada; não se declara validação integral do site nem superioridade sobre outras plataformas.

## Actualização: colaboração e importação Word

Esta secção substitui as limitações anteriores relativas a partilha e importação simples; as restantes limitações continuam aplicáveis.

- O titular pode conceder **edição** ou leitura a membros de uma equipa existente. Editores acrescentam notas e guardam novas versões; não sobrescrevem nem apagam originais. O titular gere permissões e elimina conteúdo. Os registos novos incluem a conta autora e a referência à versão anterior. Isto é edição por versões, não co-edição simultânea de texto.
- Permissões são aplicadas na base de dados, não apenas nos botões. Revogar, sair da equipa ou remover o titular da equipa termina o acesso. Regressar à equipa não repõe concessões anteriores. As cópias já exportadas não podem ser revogadas. Novos dossiers continuam privados.
- Word aceita importação **local** de DOCX até 5 MB e 10 MB descomprimidos. Preserva a estrutura e os estilos de documentos simples; o texto alterado usa a formatação inicial do parágrafo. Para esse modo, deve manter-se o número de parágrafos. Não envia os ficheiros para servidores ou IA. Existe alternativa explícita de exportação sem a formatação original.
- Tabelas, imagens no corpo, campos, marcadores, revisões preexistentes, macros e relações externas são recusados. Cabeçalhos/rodapés são conservados, não revistos. Não anunciar compatibilidade universal com Word nem suplemento nativo.

### Activação desta actualização

1. Fazer Push origin e esperar pelo deploy Ready.
2. Abrir `/setup/services`, copiar o SQL e executar uma vez no projecto Supabase correcto. Inclui 007, 008 e **019_dossier_sharing.sql** e pressupõe a configuração de equipas 002. Não apagar tabelas nem desligar RLS. Os dossiers existentes são conservados; autores antigos não são inventados.
3. Em Dossiers, seleccionar um dossier próprio → Consultar acessos e membros → escolher equipa, membro e **Edição** → Guardar permissão. Confirmar conscientemente a divulgação de todas as notas, incluindo futuras.
4. O membro entra com a sua própria conta e encontra o dossier com a indicação “equipa (edição)”. Pode guardar notas ou preparar uma nova versão. O titular pode mudar para leitura ou revogar.

Não foram activados pagamentos, modelos externos ou consumo pago. A migração ainda tem de ser aplicada no Supabase real; os testes locais não o fazem.

## Evidência e avaliação já disponíveis

- Nos dossiers, fontes com URL, artigo/processo/página, versão ou limitação de vigência, data e excerto. A conferência é manual; editar a fonte retira a marca de conferida.
- Em /quality-review, grelha de avaliação humana, critérios inicialmente pendentes, evidência obrigatória para classificações, exportação ou gravação num dossier. Editores podem guardar avaliações em dossiers partilhados. Nome e qualificações do revisor são declarados, não verificados.
- Sem chamadas pagas, instalação de novos pacotes ou activação comercial.

## O que não se deve anunciar como concluído

- Base jurídica exaustiva/licenciada e verificação automática da vigência.
- Compatibilidade universal com DOCX, edição de tabelas/imagens/campos complexos ou suplemento nativo do Word.
- Co-edição em tempo real, auditoria imutável ou preservação de registos eliminados pelo titular.
- Campanha de avaliação por juristas identificados ou prova estatística de superioridade face a concorrentes.
- Aprovação jurídica/fiscal/Stripe ou prontidão comercial integral: estes novos testes verificam as funcionalidades alteradas, não substituem essas aprovações.
