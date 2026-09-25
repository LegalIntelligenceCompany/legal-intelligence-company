import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {ServicesSetup} from '@/components/services-setup';
export default function Page(){
 const sql=['007_library.sql','008_clauses.sql','019_dossier_sharing.sql'].map(name=>readFileSync(join(process.cwd(),'supabase/migrations',name),'utf8')).join('\n\n');
 return <AppShell><h1>Activar dossiers, temas, cláusulas e partilha</h1><p>Execute este código no SQL Editor do seu projecto Supabase, depois da configuração de equipas (002). Inclui as actualizações 007, 008 e 019, pode ser repetido e conserva os registos existentes. A partilha fica desligada até o titular escolher explicitamente um membro. Não activa IA paga, cobranças ou e-mails.</p><ServicesSetup sql={sql}/><p>Depois de executar sem erros, abra a <Link href="/clauses">biblioteca de cláusulas</Link> ou os <Link href="/library">dossiers</Link>.</p></AppShell>;
}
