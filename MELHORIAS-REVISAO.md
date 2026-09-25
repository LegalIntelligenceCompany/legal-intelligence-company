# Revisão, evidência e avaliação — 25/09/2026

Incremento sem novas dependências, chamadas pagas ou activação de fornecedores.

## Utilizar depois do deploy

1. Serviços jurídicos → **Revisão em Word** (`/word-review`): colar original e proposta, identificar revisor e exportar DOCX. As alterações são inserções/eliminações por parágrafo, incluindo marcas de parágrafo. Não importa ficheiros existentes nem conserva tabelas, imagens, cabeçalhos ou formatação de um contrato. Confirmar no Word o resultado de aceitar/rejeitar alterações antes de utilizar profissionalmente.
2. **Dossiers** (`/library`): acrescentar fontes com URL, artigo/processo/página, versão ou limitação de vigência, data e excerto. A declaração de conferência exige estes campos e é anulada ao editar a fonte. Não há consulta automática da fonte, certificação ou base jurídica licenciada.
3. Em cada nota, **Preparar nova versão sem alterar o original** cria um rascunho; Guardar cria um registo novo. Os registos mantêm as datas e podem ser exportados. Não há árvore de revisões nem auditoria imutável: o titular pode apagar os registos. Os dossiers continuam pessoais, protegidos pelas permissões existentes; não há partilha de dossiers com equipas neste incremento.
4. Serviços jurídicos → **Avaliação humana de respostas** (`/quality-review`): preencher caso, resposta e critérios, documentar evidência, tempo e custo conhecidos. Exportar ou guardar expressamente num dossier pessoal. Critérios começam pendentes. O nome é declarado e não verifica a qualidade de advogado. Não produz uma avaliação automática nem uma prova de superioridade.

Não é necessária nova migração SQL: os metadados das fontes usam o campo JSON existente. Mantêm-se os limites de 100 fontes e aproximadamente 59 KB de metadados por nota. Nenhuma chave, tarifa, saldo, plano ou sinalizador comercial foi alterado.

## Ainda não implementado / dependências reais

- Cobertura jurídica exaustiva, licenciada e versionada de Portugal/UE; verificação automática de excertos e vigência.
- Importação e redline de DOCX arbitrários, preservação de formatação e suplemento nativo do Word.
- Partilha de dossiers com permissões por membro e auditoria imutável.
- Campanha de avaliação por juristas identificados, casos de referência validados, comparação estatística com concorrentes e medições automáticas.

Estas capacidades não devem ser anunciadas como existentes. A nova grelha é uma ferramenta para começar a recolher avaliações reais, não uma substituição dessas avaliações.
