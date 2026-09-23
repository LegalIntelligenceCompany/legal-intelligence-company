'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
type Wallet={id:string;scope:string;balanceCents:number;reservedCents:number;availableCents:number;active:boolean;frozen:boolean;isOwner:boolean;subscribed:boolean;seats:{user_id:string}[];members:{user_id:string;role:string}[]};
type State={enabled:boolean;wallets:Wallet[];organizations?:{organization_id:string}[];terms?:string;termsURL?:string;userId?:string};
const euros=(v:number)=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(v/100);
export function LiveCreditsPanel(){
 const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[accepted,setAccepted]=useState(false),[amount,setAmount]=useState('20'),[org,setOrg]=useState('');
 const lock=useRef(false),alive=useRef(true);
 async function refresh(){try{
  const session=new URL(window.location.href).searchParams.get('session_id');
  const r=await fetch('/api/live-credits'+(session?'?session_id='+encodeURIComponent(session):''),{cache:'no-store'}),data=await r.json();if(!r.ok)throw Error(data.error);
  if(alive.current){
   for(const key of Object.keys(sessionStorage))if(key.startsWith(`lic-live-order:${data.userId}:`)&&data.settledOrderIds?.includes(sessionStorage.getItem(key)))sessionStorage.removeItem(key);
   setState(data);setError('');
  }
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Não foi possível actualizar o saldo.');}}
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;};},[]);
 async function action(body:Record<string,unknown>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  if(body.action==='checkout'){
   if(!accepted||!state?.terms)throw Error('Leia e aceite as condições.');
   const storageKey=`lic-live-order:${state.userId}:${body.walletId}:${body.kind}:${body.amountCents||0}`;
   let id=sessionStorage.getItem(storageKey);if(!id){id=crypto.randomUUID();sessionStorage.setItem(storageKey,id);}
   body={...body,requestId:id,terms:state.terms};
  }
  const r=await fetch('/api/live-credits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await r.json();if(!r.ok)throw Error(data.error);
  if(data.url){const url=new URL(data.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw Error('Destino de pagamento inválido.');window.location.assign(url.href);return;}
  await refresh();
 }catch(e){setError(e instanceof Error?e.message:'Não foi possível confirmar. Actualize o estado antes de repetir.');}finally{lock.current=false;setBusy(false);}}
 const cents=Math.round(Number(amount.replace(',','.'))*100),valid=Number.isSafeInteger(cents)&&cents>=100&&cents<=50000;
 return <section className="card team-panel"><p>Individual: 49 €/mês. Empresas: 99 €/mês, até três utilizadores com saldo partilhado. Acresce IVA quando aplicável.</p><p>As subscrições dão acesso; não incluem créditos de IA. Os créditos são comprados separadamente. Nos serviços com consumo comercial activo, o débito corresponde a 3× o custo confirmado do fornecedor, convertido em euros. Não há carregamentos automáticos. Cada serviço depende de tarifas validadas e apresenta a reserva máxima antes do envio.</p>
 <button className="btn btn-secondary" disabled={busy} onClick={()=>void refresh()}>Actualizar estado</button>{busy&&<p role="status">A confirmar a operação… Não volte a clicar.</p>}{error&&<p role="alert">{error}</p>}
 {!state?<p>A carregar a carteira…</p>:!state.enabled?<p role="status">Os pagamentos comerciais ainda não estão activos. Não será cobrado qualquer valor nesta página.</p>:<>
 <label className="analysis-consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Li e aceito as <a href={state.termsURL} target="_blank" rel="noreferrer">condições de subscrição e créditos</a>, incluindo preços, IVA, reservas e reembolsos.</span></label>
 <div className="workspace-toolbar"><button className="btn btn-secondary" disabled={busy} onClick={()=>void action({action:'open'})}>Abrir carteira pessoal</button>{!!state.organizations?.length&&<><label>Empresa<select value={org} onChange={e=>setOrg(e.target.value)}><option value="">Escolha a empresa</option>{state.organizations.map(o=><option key={o.organization_id} value={o.organization_id}>{o.organization_id}</option>)}</select></label><button className="btn btn-secondary" disabled={busy||!org} onClick={()=>void action({action:'open',organizationId:org})}>Abrir carteira da empresa</button></>}</div>
 <label>Valor de créditos antes de IVA (€)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label><p>Entre 1 € e 500 €. O total, com os impostos aplicáveis, é apresentado na Stripe antes da confirmação.</p>
 {state.wallets.map(w=><article className="card" key={w.id}><h2>{w.scope==='company'?'Empresa · 99 €/mês':'Individual · 49 €/mês'}</h2><p>Disponível: {euros(w.availableCents)} · Reservado: {euros(w.reservedCents)} · Saldo total: {euros(w.balanceCents)}</p><p>{w.frozen?'Carteira bloqueada para revisão. Contacte o apoio.':w.active?'Subscrição activa no último estado confirmado.':'Subscrição por confirmar. O estado será validado antes de cada utilização.'}</p>
 {w.isOwner&&!w.frozen&&<div className="workspace-toolbar">{!w.subscribed?<button className="btn btn-primary" disabled={busy||!accepted} onClick={()=>void action({action:'checkout',walletId:w.id,kind:'access'})}>Subscrever por {w.scope==='company'?'99':'49'} €/mês + IVA</button>:<><button className="btn btn-secondary" disabled={busy} onClick={()=>void action({action:'portal',walletId:w.id})}>Gerir subscrição</button><button className="btn btn-primary" disabled={busy||!accepted||!valid} onClick={()=>void action({action:'checkout',walletId:w.id,kind:'credits',amountCents:cents})}>Comprar {valid?euros(cents):''} de créditos + IVA</button></>}</div>}
 {w.isOwner&&w.frozen&&w.subscribed&&<button className="btn btn-secondary" disabled={busy} onClick={()=>void action({action:'portal',walletId:w.id})}>Gerir ou cancelar subscrição</button>}
 {w.isOwner&&w.subscribed&&!w.frozen&&!w.active&&<button className="btn btn-secondary" disabled={busy||!accepted} onClick={()=>void action({action:'checkout',walletId:w.id,kind:'access'})}>Voltar a subscrever após cancelamento</button>}
 {w.isOwner&&w.scope==='company'&&<><h3>Utilizadores da carteira (máximo 3)</h3><p>Adicione primeiro os membros na página Equipa. O titular ocupa um dos lugares.</p>{w.members.map(m=>{const added=w.seats.some(s=>s.user_id===m.user_id);return <p key={m.user_id}>{m.user_id===state.userId?'Titular':m.user_id} <button className="btn btn-secondary" disabled={busy||m.user_id===state.userId||(!added&&w.seats.length>=3)} onClick={()=>void action({action:'seat',walletId:w.id,memberId:m.user_id,add:!added})}>{added?'Retirar acesso':'Dar acesso'}</button></p>;})}</>}
 </article>)}<Link className="btn btn-primary" href="/chat">Abrir pesquisa jurídica</Link></>}
 </section>;
}
