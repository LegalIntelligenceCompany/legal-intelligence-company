'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
export function AccountPanel(){
 const [email,setEmail]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;const client=createClient();void client?.auth.getUser().then(({data})=>{if(alive)setEmail(data.user?.email||'');}).catch(()=>{if(alive)setMessage('Não foi possível verificar a sessão.');});return()=>{alive=false;};},[]);
 async function signOut(){if(busy)return;setBusy(true);setMessage('');try{const client=createClient();if(!client)throw Error();const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;try{localStorage.removeItem('lic-selected-company');for(const key of Object.keys(sessionStorage))if(key.startsWith('lic-'))sessionStorage.removeItem(key);}catch{/* Storage may be unavailable; the authenticated session is already closed. */}window.location.replace('/login');}catch{setMessage('Não foi possível terminar a sessão. Tente novamente; confirme sempre a saída num computador partilhado.');setBusy(false);}}
 return <section className="card team-panel"><h2>A sua conta</h2>{email?<><p>Sessão iniciada como {email}.</p><p>Antes de sair, exporte o trabalho não guardado. Sair não cancela a subscrição nem pedidos já enviados.</p><button className="btn btn-secondary" disabled={busy} onClick={()=>void signOut()}>{busy?'A sair…':'Terminar sessão neste navegador'}</button></>:<Link className="btn btn-primary" href="/login?next=/settings">Entrar na conta</Link>}<p role="status">{message}</p><div className="workspace-toolbar"><Link href="/credits">Plano, créditos e cancelamento</Link><Link href="/usage">Histórico de consumo</Link><Link href="/help">Ajuda e pedidos sobre dados</Link></div></section>;
}
