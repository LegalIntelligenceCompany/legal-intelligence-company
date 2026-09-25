import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {AppShell} from '@/components/app-shell';
import {ServicesSetup} from '@/components/services-setup';
export const dynamic='force-dynamic';
export default function RecoverySetup(){return <AppShell><h1>Instalar recuperação de resultados</h1><p>Execute uma vez o SQL 018. Não repõe créditos nem activa pagamentos. Só os resultados de pedidos com autorização explícita serão guardados. PDFs, áudio e perguntas não são copiados para esta tabela.</p><ServicesSetup sql={readFileSync(join(process.cwd(),'supabase/migrations/018_result_recovery.sql'),'utf8')}/></AppShell>;}
