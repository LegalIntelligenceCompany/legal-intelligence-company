"use client";
import type { LibrarySource } from '@/lib/library';
export function SourceEvidence({sources,onChange,disabled=false}:{sources:LibrarySource[];onChange:(value:LibrarySource[])=>void;disabled?:boolean}){
 function patch(index:number,value:Partial<LibrarySource>){onChange(sources.map((s,i)=>i===index?{...s,...value,reviewed:false}:s));}
 return <fieldset disabled={disabled}><legend>Fontes e evidência</legend><p>Abra a fonte e transcreva apenas o excerto necessário. O site não confirma automaticamente o conteúdo, a vigência ou a aplicabilidade. A revisão é uma declaração sua.</p>
 {sources.map((s,i)=><fieldset key={i}><legend>Fonte {i+1}</legend>
 <label>Título<input required maxLength={250} value={s.title} onChange={e=>patch(i,{title:e.target.value})}/></label>
 <label>URL<input required type="url" maxLength={2000} value={s.url} onChange={e=>patch(i,{url:e.target.value})}/></label>
 <label>Artigo / processo / página<input maxLength={500} value={s.reference||''} onChange={e=>patch(i,{reference:e.target.value})}/></label>
 <label>Versão e vigência (indique se desconhecida)<input maxLength={500} value={s.version||''} onChange={e=>patch(i,{version:e.target.value})}/></label>
 <label>Data da consulta<input type="date" value={s.consulted||''} onChange={e=>patch(i,{consulted:e.target.value})}/></label>
 <label>Excerto literal relevante<textarea maxLength={4000} value={s.excerpt||''} onChange={e=>patch(i,{excerpt:e.target.value})}/></label>
 <label><input type="checkbox" checked={s.reviewed===true} disabled={!s.excerpt?.trim()||!s.reference?.trim()||!s.version?.trim()||!s.consulted} onChange={e=>onChange(sources.map((v,n)=>n===i?{...v,reviewed:e.target.checked}:v))}/>Conferi este excerto na fonte indicada e registei as limitações de vigência.</label>
 <button type="button" onClick={()=>onChange(sources.filter((_,n)=>n!==i))}>Remover fonte do rascunho</button></fieldset>)}
 <button type="button" disabled={sources.length>=100} onClick={()=>onChange([...sources,{title:'',url:''}])}>Acrescentar fonte</button></fieldset>;
}
