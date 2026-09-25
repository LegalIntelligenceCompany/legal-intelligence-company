"use client";
import { useState } from 'react';
import Link from 'next/link';
import { reportText, type AssistantResult } from '@/lib/assistant';
import type { Dossier } from '@/lib/library';
export function SaveResearch({question,result}:{question:string;result:AssistantResult}) {
 const [list,setList]=useState<Dossier[]|null>(null),[id,setId]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function act(){if(busy)return;setBusy(true);setMessage('');try{if(!list){const r=await fetch('/api/library');const d=await r.json();if(!r.ok)throw Error(d.error);setList(d.dossiers.filter((d:Dossier)=>d.canEdit!==false));return;}const r=await fetch('/api/library',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',id:crypto.randomUUID(),dossierId:id,title:question.slice(0,160),body:reportText(result),sources:[...new Map(result.citations.map(c=>[c.url,{title:c.title,url:c.url}])).values()]})});const d=await r.json();if(!r.ok)throw Error(d.error);setMessage('Resposta e fontes guardadas.');}catch(e){setMessage(e instanceof Error?e.message:'Falha ao guardar.');}finally{setBusy(false);}}
 return <div>{list&&<label>Guardar em<select value={id} onChange={e=>setId(e.target.value)}><option value="">Escolha um dossier ou tema</option>{list.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label>}<button className="btn btn-secondary" disabled={busy||Boolean(list&&!id)} onClick={()=>void act()}>{list?'Guardar resposta':'Guardar num dossier'}</button>{list?.length===0&&<Link href="/library">Criar primeiro um dossier</Link>}<p role="status">{message}</p></div>;
}
