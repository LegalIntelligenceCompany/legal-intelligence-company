'use client';
import {useRef,useState} from 'react';
import {verifyModelAccess} from '@/app/setup/models/actions';

export function ModelAccessCheck({id,disabled}:{id:string;disabled:boolean}){
 const running=useRef(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function check(){
  if(running.current)return;
  running.current=true;setBusy(true);setMessage('A consultar o fornecedor, sem gerar uma resposta…');
  try{setMessage(await verifyModelAccess(id));}
  catch{setMessage('A verificação não terminou. Não foi confirmada a disponibilidade do modelo.');}
  finally{running.current=false;setBusy(false);}
 }
 return <div style={{margin:'0.75rem 0 1.5rem'}}><button type="button" className="btn btn-secondary" disabled={disabled||busy} onClick={check}>{busy?'A verificar…':'Verificar acesso — sem geração'}</button><p role="status" aria-live="polite">{message}</p></div>;
}
