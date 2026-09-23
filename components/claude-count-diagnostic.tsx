'use client';
import {useRef,useState} from 'react';
import {diagnoseClaude} from '@/app/setup/models/pilot-actions';
export function ClaudeCountDiagnostic(){
 const running=useRef(false);const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <section className="card team-panel"><h2>Diagnóstico Claude — sem geração</h2><p>Consulta apenas a contagem de tokens do mesmo teste fictício. Não repete a geração, não altera a reserva de 1 € nem activa modelos. O resultado actual não reconstitui o erro da tentativa anterior.</p><button className="btn btn-secondary" disabled={busy} onClick={async()=>{if(running.current)return;running.current=true;setBusy(true);setMessage('A verificar a contagem de tokens…');try{setMessage(await diagnoseClaude());}catch{setMessage('Não foi possível concluir o diagnóstico. Não foi pedido texto ao Claude.');}finally{running.current=false;setBusy(false);}}}>{busy?'A diagnosticar…':'Diagnosticar contagem — sem geração'}</button><p role="status" aria-live="polite">{message}</p></section>;
}
