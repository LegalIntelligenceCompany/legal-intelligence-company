"use client";
import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from './app-shell';
import { CompanyWorkspace } from './company-workspace';
import { AssistantPanel } from './assistant-panel';
import { workflows, type Workflow } from '@/lib/services';
export function ServiceWorkbench({workflow}:{workflow:Workflow}) {
 const [privateDocument,setPrivateDocument]=useState(false);
 const w=workflows[workflow];
 const toggle=workflow==='reviewer'?<p><button className="btn btn-secondary" onClick={()=>{if(confirm('Mudar de modo elimina a conversa não guardada. Continuar?'))setPrivateDocument(!privateDocument);}}>{privateDocument?'Usar texto público com pesquisa de fontes':'Rever um PDF privado sem pesquisa web'}</button></p>:null;
 if(['timeline','explainer','evidence','dossier-search','negotiation'].includes(workflow)||(workflow==='reviewer'&&privateDocument))return <CompanyWorkspace title={w.title} description={w.description}>{company=><><p>PDF privado: apenas leitura documental, sem confirmação externa de legislação. IA sujeita a autorização e orçamento de teste.</p><Link href="/setup/pilot">Consultar orçamento do piloto</Link>{toggle}<Link href="/contracts/new">Carregar PDFs</Link><AssistantPanel key={`${workflow}-private`} organizationId={company.id} workflow={workflow}/></>}</CompanyWorkspace>;
 return <AppShell><Link href="/services">Todos os serviços</Link><h1>{w.title}</h1><p>IA sujeita a autorização e orçamento de teste. Não é possível garantir ausência de erros. Pode guardar respostas públicas num dossier ou exportá-las.</p>{toggle}<AssistantPanel key={`${workflow}-public`} workflow={workflow}/></AppShell>;
}
