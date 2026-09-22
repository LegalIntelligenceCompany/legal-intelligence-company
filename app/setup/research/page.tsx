import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {ServicesSetup} from '@/components/services-setup';
export default function Page(){return <AppShell><div className="eyebrow">Configuração única</div><h1>Pesquisa recuperável</h1><p>Esta actualização cria uma tabela privada de pedidos. Não altera o orçamento, não faz chamadas pagas e não activa pagamentos comerciais. Execute o SQL no Supabase uma única vez.</p><ServicesSetup sql={readFileSync(join(process.cwd(),'supabase/migrations/010_research_jobs.sql'),'utf8')}/><p><Link className="btn btn-primary" href="/chat">Voltar ao chat</Link></p></AppShell>;}
