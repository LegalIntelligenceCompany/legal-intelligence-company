"use client";
import {useState} from 'react';
export function ServicesSetup({sql}:{sql:string}){
 const [message,setMessage]=useState('');
 return <><button className="btn btn-primary" onClick={async()=>{try{await navigator.clipboard.writeText(sql);setMessage('SQL copiado. Cole no SQL Editor do seu projecto Supabase e execute.');}catch{setMessage('Não foi possível copiar automaticamente. Seleccione o código abaixo e copie.');}}}>Copiar código SQL completo</button><p role="status">{message}</p><textarea aria-label="Código SQL para copiar" readOnly value={sql} rows={24} style={{width:'100%',fontFamily:'monospace',whiteSpace:'pre',overflow:'auto'}}/></>;
}
