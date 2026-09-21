# Activar contratos e políticas

O código está implementado. Falta aplicar a actualização à base de dados.

1. Com o site aberto, visite http://localhost:3000/setup/documents.
2. Clique em **Copiar código SQL**.
3. No seu projecto Supabase, abra **SQL Editor** e clique no **+** junto ao separador da consulta.
4. Cole o código e clique em **Run**. Esta actualização pode ser repetida e não elimina os documentos existentes.
5. Depois de aparecer **Success**, volte ao site.
6. Entre na sua conta, abra **Políticas → Nova política**, escreva um título e as regras e guarde.
7. Em **Contratos → Carregar contrato**, escolha um PDF ou DOCX até 20 MB e clique em **Guardar contrato privado**.
8. Abra o contrato guardado e descarregue-o para confirmar o acesso.

Também pode copiar o conteúdo do ficheiro `003_documents.sql` entregue com este guia.

O dashboard mostra as contagens reais. A empresa seleccionada é partilhada entre Equipa, Empresa, Políticas, Contratos e Visão geral. Os membros dessa empresa podem ler, criar e editar políticas e carregar e descarregar contratos. Os ficheiros não têm URLs públicos.

A análise com IA ainda não está activa: o estado correcto depois de um carregamento é **Guardado · sem análise**.

Validação efectuada: lint, TypeScript, build de produção e cinco testes de validação de ficheiros/estados. A página sem sessão foi verificada no navegador. O carregamento real e os testes entre duas contas dependem desta actualização no Supabase; ainda não foram executados contra o seu projecto.
