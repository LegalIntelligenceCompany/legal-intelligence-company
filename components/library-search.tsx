"use client";
import {useState,useRef,useEffect} from 'react';
import {createClient} from '@/lib/supabase/client';
export function LibrarySearch({onOpen}:{onOpen:(id:string)=>void}){
 const [query,setQuery]=useState(''),[rows,setRows]=useState<{id:string;dossier_id:string;title:string;body:string}[]>([]),[status,setStatus]=useState('');const epoch=useRef(0);
 useEffect(()=>{const sub=createClient()?.auth.onAuthStateChange(e=>{if(e==='SIGNED_OUT'||e==='SIGNED_IN'){epoch.current++;setRows([]);setQuery('');setStatus('');}});return()=>{epoch.current++;sub?.data.subscription.unsubscribe();};},[]);
 return <details><summary>Pesquisar em todos os dossiers autorizados</summary><form onSubmit={async e=>{e.preventDefault();const version=++epoch.current;setRows([]);setStatus('A pesquisar…');const client=createClient();const result=await client?.rpc('research_search',{p_query:query,p_dossier:null});if(version!==epoch.current)return;if(!result||result.error){setStatus('Pesquisa indisponível. Confirme sessão e instalação 020.');return;}setRows(result.data??[]);setStatus(`${result.data?.length??0} resultados (máximo 50).`);}}><label>Palavras ou expressão<input required minLength={2} maxLength={200} value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="btn btn-secondary">Pesquisar</button></form><p role="status">{status}</p>{rows.map(r=><article key={r.id}><button onClick={()=>onOpen(r.dossier_id)}>{r.title}</button><p>{r.body.slice(0,280)}</p></article>)}</details>;
}
