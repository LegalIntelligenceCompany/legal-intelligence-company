# Activar análise — Legal Intelligence Company

O código está implementado. Falta activar a base de dados e a chave privada do Supabase; não envie chaves pelo chat.

1. Com o site a funcionar, abra http://localhost:3000/setup/analysis.
2. Clique **Copiar código SQL**.
3. No Supabase → SQL Editor, clique no **+** junto da consulta actual, cole o código e clique **Run**. Espere **Success**. Requer as actualizações anteriores 001, 002 e 003.
4. No Supabase → Settings → API Keys, obtenha uma chave secreta de servidor (sb_secret_...; a antiga service_role também é compatível).
5. Abra o ficheiro .env.local no TextEdit e acrescente uma linha com o nome exacto SUPABASE_SERVICE_ROLE_KEY seguido de = e da chave. Não altere a URL, a chave publicável ou OPENAI_API_KEY. Não use NEXT_PUBLIC_ para chaves privadas.
6. Guarde e reinicie o servidor (Control+C e npm run dev).
7. Abra Contratos e escolha um PDF fictício até 10 MB. Marque a autorização de envio à OpenAI e clique **Analisar contrato**. Esta operação tem custos na API.

Os resultados exigem revisão humana. DOCX tem de ser convertido para PDF. Os testes locais passaram; a chamada real à OpenAI ainda tem de ser verificada após configurar o Supabase. O site ainda não está publicado para acesso externo.
