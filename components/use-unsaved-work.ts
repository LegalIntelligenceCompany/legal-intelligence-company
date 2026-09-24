'use client';
import {useEffect} from 'react';
// No content is persisted. Browsers control the wording of their native warning.
export function useUnsavedWork(active:boolean){
 useEffect(()=>{
  if(!active)return;
  const leave=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  const navigate=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const link=event.target instanceof Element?event.target.closest('a'):null;
   if(!link||link.hasAttribute('download')||link.target==='_blank')return;
   const href=link.getAttribute('href');if(!href||href.startsWith('#'))return;
   const target=new URL(link.href,window.location.href);
   if(target.pathname===window.location.pathname&&target.search===window.location.search)return;
   if(!window.confirm('Pode perder o resultado não exportado ou um pedido em curso. Sair não cancela o consumo já iniciado. Quer sair desta página?')){event.preventDefault();event.stopPropagation();}
  };
  window.addEventListener('beforeunload',leave);document.addEventListener('click',navigate,true);
  return()=>{window.removeEventListener('beforeunload',leave);document.removeEventListener('click',navigate,true);};
 },[active]);
}
