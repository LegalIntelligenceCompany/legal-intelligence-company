import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
export default function Page(){const sql=readFileSync(join(process.cwd(),'supabase/migrations/007_library.sql'),'utf8');return <main className="container"><h1>Activar dossiers e temas guardados</h1><p>No SQL Editor do seu projecto Supabase, execute o código abaixo. Cria tabelas pessoais com controlo de acesso; não activa IA paga, cobranças ou e-mails.</p><textarea aria-label="Código SQL para copiar" readOnly defaultValue={sql} rows={24}/><p>Depois de executar sem erros, <Link href="/library">abra os dossiers</Link>.</p></main>;}
