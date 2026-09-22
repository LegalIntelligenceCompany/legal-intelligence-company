import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {ServicesSetup} from '@/components/services-setup';
export default function Page(){
 const sql=['007_library.sql','008_clauses.sql'].map(name=>readFileSync(join(process.cwd(),'supabase/migrations',name),'utf8')).join('\n\n');
 return <AppShell><h1>Activar dossiers, temas e cláusulas</h1><p>Execute este código no SQL Editor do seu projecto Supabase. Inclui as actualizações 007 e 008, pode ser repetido e conserva os registos existentes. Não activa IA paga, cobranças ou e-mails.</p><ServicesSetup sql={sql}/><p>Depois de executar sem erros, abra a <Link href="/clauses">biblioteca de cláusulas</Link> ou os <Link href="/library">dossiers</Link>.</p></AppShell>;
}
