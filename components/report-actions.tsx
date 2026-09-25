"use client";
import {useState} from 'react';
import {reportWord} from '@/lib/word-review';

export function ReportActions({title,text}:{title:string;text:string}){
 const [notice,setNotice]=useState('');
 function word(){try{const blob=new Blob([new Uint8Array(reportWord(title,text))],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='relatorio-lic.docx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Documento Word preparado.');}catch{setNotice('Não foi possível exportar este relatório.');}}
 function print(){
  if(text.length>2_000_000){setNotice('Relatório demasiado grande. Exporte os registos em partes.');return;}
  const tab=window.open('','_blank');if(!tab){setNotice('Permita a janela de impressão neste navegador.');return;}
  // DOM textContent, never HTML from user/model. No scripts or remote assets.
  tab.document.title=title;
  const style=tab.document.createElement('style');style.textContent='body{font:11pt/1.65 Georgia,serif;color:#172f29;margin:2cm;overflow-wrap:anywhere}h1{font-size:22pt}pre{font:inherit;white-space:pre-wrap}button{padding:12px}@page{size:A4;margin:18mm}@media print{body{margin:0}button{display:none}}';
  const heading=tab.document.createElement('h1');heading.textContent=title;
  const body=tab.document.createElement('pre');body.textContent=text;
  const button=tab.document.createElement('button');button.textContent='Imprimir / guardar como PDF';button.onclick=()=>tab.print();
  tab.document.head.appendChild(style);tab.document.body.append(button,heading,body);tab.opener=null;setNotice('Pré-visualização aberta. Escolha imprimir ou guardar como PDF.');
 }
 async function copy(){try{await navigator.clipboard.writeText(text);setNotice('Texto e fontes copiados.');}catch{setNotice('Não foi possível copiar. Use a exportação Word.');}}
 return <div className="report-actions"><div className="workspace-toolbar"><button type="button" className="btn btn-secondary" onClick={word}>Exportar Word</button><button type="button" className="btn btn-secondary" onClick={print}>Imprimir / PDF</button><button type="button" className="btn btn-secondary" onClick={()=>void copy()}>Copiar texto e fontes</button></div>{notice&&<p role="status" className="assistant-small">{notice}</p>}</div>;
}
