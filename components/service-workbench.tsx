"use client";
import Link from 'next/link';
import { AppShell } from './app-shell';
import { CompanyWorkspace } from './company-workspace';
import { AssistantPanel } from './assistant-panel';
import { workflows, type Workflow } from '@/lib/services';
export function ServiceWorkbench({workflow}:{workflow:Workflow}) {
 const w=workflows[workflow];
 if(workflow==='timeline')return <CompanyWorkspace title={w.title} description={w.description}>{company=><><Link href="/contracts/new">Carregar PDFs</Link><AssistantPanel organizationId={company.id} workflow={workflow}/></>}</CompanyWorkspace>;
 return <AppShell><Link href="/services">Todos os serviços</Link><h1>{w.title}</h1><p>IA paga desactivada nesta fase. Não é possível garantir ausência de erros. Para conservar uma resposta, exporte-a e guarde o texto num dossier.</p><AssistantPanel workflow={workflow}/></AppShell>;
}
