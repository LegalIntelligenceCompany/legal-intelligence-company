'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
type Wallet={id:string;scope:string;availableCents:number;frozen:boolean;active:boolean};
type Quote={service:string;mode:'pilot'|'commercial';wallets:Wallet[];ceiling:number};
const euros=(cents:number)=>(cents/100).toLocaleString('pt-PT',{style:'currency',currency:'EUR'});
export function useServiceFunding(service:string){
 const [quote,setQuote]=useState<Quote|null>(null),[wallet,setWallet]=useState(''),[accepted,setAccepted]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const refresh=useCallback(()=>{setQuote(null);setAccepted(false);setRevision(n=>n+1);},[]);
 useEffect(()=>{let alive=true;const controller=new AbortController();setQuote(null);setAccepted(false);setError('');
  void fetch(`/api/funding?service=${encodeURIComponent(service)}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível verificar os créditos.');if(!alive)return;setQuote({...d,service});setWallet(d.wallets?.[0]?.id||'');}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Não foi possível verificar os créditos.');});
  return()=>{alive=false;controller.abort();};
 },[service,revision]);
 useEffect(()=>{const client=createClient();const subscription=client?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN')refresh();});return()=>subscription?.data.subscription.unsubscribe();},[refresh]);
 const current=quote?.service===service?quote:null;
 const selected=current?.wallets.find(w=>w.id===wallet);
 const ready=!!current&&(current.mode==='pilot'||!!(accepted&&selected?.active&&!selected.frozen&&selected.availableCents>=current.ceiling));
 const headers:Record<string,string>=current?.mode==='commercial'&&ready?{'x-credit-wallet':wallet,'x-max-debit-cents':String(current.ceiling)}:{};
 const panel=<div className="team-notice" aria-label="Autorização de créditos">
  {!current&&!error&&<p role="status">A verificar a disponibilidade e os créditos…</p>}
  {error&&<p role="alert">{error}</p>}
  {current?.mode==='pilot'&&<p>Pedido sujeito ao orçamento de teste autorizado. <Link href="/setup/pilot">Consultar orçamento</Link></p>}
  {current?.mode==='commercial'&&<>
   <label>Carteira <select value={wallet} onChange={e=>{setWallet(e.target.value);setAccepted(false);}}>{current.wallets.map(w=><option key={w.id} value={w.id}>{w.scope==='personal'?'Pessoal':'Empresa'} · {euros(w.availableCents)} disponíveis</option>)}</select></label>
   <p>Reserva máxima: {euros(current.ceiling)} de saldo pré-pago. O débito é calculado sobre o consumo confirmado; a diferença é libertada. Consumo incerto mantém a reserva para verificação.</p>
   {(!selected||!selected.active||selected.frozen||selected.availableCents<current.ceiling)&&<p>É necessária uma subscrição activa e saldo disponível suficiente. <Link href="/credits">Gerir créditos</Link></p>}
   <label className="analysis-consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>Autorizo esta reserva e o débito do consumo até este limite.</label>
  </>}
  {(error||current?.mode==='commercial')&&<button type="button" className="btn btn-secondary" onClick={refresh}>Actualizar créditos</button>}
 </div>;
 return{ready,headers,panel,refresh};
}
