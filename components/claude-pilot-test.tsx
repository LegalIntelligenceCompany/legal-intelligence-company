'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {testClaude} from '@/app/setup/models/pilot-actions';
export function ClaudePilotTest({disabled}:{disabled:boolean}){
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const lock=useRef(false);const router=useRouter();
 return <div><label><input type="checkbox" checked={consent} disabled={disabled||busy} onChange={e=>setConsent(e.target.checked)}/> Autorizo uma única tentativa Claude Sonnet, com reserva de 1 € dentro do limite total de 10 €. Serão enviados apenas dois documentos fictícios incluídos no teste.</label><p>Sem pesquisa OpenAI nem dados de clientes. Até 2 000 tokens de entrada e 600 de saída. Uma falha mantém a reserva e não permite repetir. Não activa modelos comerciais.</p><button className="btn btn-primary" disabled={disabled||busy||!consent} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);setMessage('A executar o teste. Não feche a página nem volte a enviar.');try{setMessage(await testClaude(consent));}catch{setMessage('Ligação interrompida. A tentativa pode ter sido reservada; consulte o estado após actualizar. Não repita.');}finally{setBusy(false);router.refresh();}}}>{busy?'A testar Claude…':'Executar teste único — reservar 1 €'}</button><p role="status" aria-live="polite">{message}</p></div>;
}
