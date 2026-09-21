# Pesquisa jurídica — como utilizar

A análise passa a procurar legislação, acórdãos e orientações relevantes disponíveis na web, além de comparar as políticas da empresa. Não é uma pesquisa exaustiva nem um parecer jurídico.

1. Reinicie o site: no Terminal onde está a funcionar, Control+C e depois npm run dev.
2. Abra http://localhost:3000/contracts e escolha um PDF de teste até 10 MB.
3. Em **País da lei aplicável**, escolha o país ou mantenha a identificação automática. A IA não deve deduzir a lei apenas da língua ou da morada das partes.
4. Leia e marque a autorização de análise e pesquisa. São operações pagas na conta API.
5. Clique **Analisar contrato** ou, para um relatório já guardado, **Criar nova análise**.
6. Confira no relatório: âmbito/data da pesquisa, limitações, fontes clicáveis, relação com cada cláusula e redacções alternativas propostas. Pode copiar uma proposta, mas deve revê-la antes de a usar.

Não é necessário repetir o SQL se a actualização 004 já estiver activa. Não precisa de outra chave. OPENAI_RESEARCH_MODEL é opcional e permite usar outro modelo compatível com pesquisa web.

O motor de pesquisa recebe temas genéricos de uma lista controlada, não o PDF nem o texto privado das políticas. A OpenAI continua a receber os documentos nas etapas privadas de classificação e análise.

Se aparecer **Pesquisa jurídica incompleta**, leia o motivo. A aplicação não deve apresentar pesquisa falhada, ausência de fontes ou lei ambígua como confirmação de conformidade. Mesmo com fontes, é preciso confirmar o texto, a vigência, a interpretação e a aplicação ao caso. Os testes locais não substituem essa revisão.
