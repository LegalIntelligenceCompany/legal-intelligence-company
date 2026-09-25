# Revisão, evidência e avaliação — 25/09/2026

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
