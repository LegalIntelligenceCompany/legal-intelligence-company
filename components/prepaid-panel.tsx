'use client';
import Link from 'next/link';
import { useCallback,useEffect,useRef,useState } from 'react';
type Team={id:string;name:string;role:string;members:{id:string;email:string;role:string}[]};
type Wallet={id:string;plan:string;organization_id:string|null;balance_cents:number;reserved_cents:number;available_cents:number;active_until:string|null;frozen:boolean;seats:{user_id:string}[];ledger:{source:string;delta_cents:number;created_at:string}[]};
const money=(c:number)=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(c/100);
export function PrepaidPanel({teams}:{teams:Team[]}){
 const [wallets,setWallets]=useState<Wallet[]>([]),[message,setMessage]=useState('A consultar o saldo de teste…'),[busy,setBusy]=useState(false);
 const pending=useRef(false),mounted=useRef(false),lastOrder=useRef<{signature:string;id:string}|null>(null);
 const [organization,setOrganization]=useState(teams.find(t=>t.role==='owner')?.id||'');
 const [amount,setAmount]=useState('10');
 const refresh=useCallback(async()=>{
  if(pending.current)return;pending.current=true;if(mounted.current)setBusy(true);
  try{
   const session=new URL(window.location.href).searchParams.get('session_id');
   const r=await fetch('/api/credits'+(session?'?session_id='+encodeURIComponent(session):''),{cache:'no-store',signal:AbortSignal.timeout(65000)});const data=await r.json();
   if(!r.ok)throw Error(data.error||'Não foi possível confirmar o saldo.');
   if(mounted.current){setWallets(data.wallets);setMessage('Saldo de teste actualizado automaticamente. Não permite usar IA paga.');}
   // Confirmation is idempotent; keep session in URL if the server cannot verify it.
   if(session){const url=new URL(window.location.href);url.searchParams.delete('session_id');window.history.replaceState(null,'',url);}
  }catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'Falha de ligação.');}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 },[]);
 useEffect(()=>{mounted.current=true;void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15000);return()=>{mounted.current=false;clearInterval(timer);};},[refresh]);
 async function action(body:Record<string,unknown>){
  if(pending.current)return;pending.current=true;setBusy(true);setMessage('A confirmar a operação…');
  try{
   if(body.action==='checkout'){
    const signature=JSON.stringify(body);
    if(lastOrder.current?.signature!==signature)lastOrder.current={signature,id:crypto.randomUUID()};
    body={...body,requestId:lastOrder.current!.id};
   }
   const r=await fetch('/api/credits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(65000)});const data=await r.json();
   if(!r.ok)throw Error(data.error||'Não foi possível concluir.');
   if(data.url){const url=new URL(data.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname)||url.username||url.password||url.port)throw Error('Destino inválido.');window.location.assign(url.href);return;}
   setMessage(data.aiCalled===false?'Simulação concluída. Não foi feita nenhuma chamada à IA.':'Operação guardada.');
  }catch(e){setMessage(e instanceof Error?e.message:'Falha de ligação. Consulte o saldo antes de repetir.');}
  finally{pending.current=false;setBusy(false);}
  // Do not replace action errors with an immediate success message. Periodic
  // read-only refresh updates the balance without resubmitting any operation.
 }
 return <>
  <div className="notice"><strong>Apenas teste — não são pagamentos reais.</strong><p>Mensalidade de acesso separada do consumo. Créditos comprados antecipadamente; sem carregamento automático do cartão. IA comercial continua bloqueada.</p></div>
  <p role="status" aria-live="polite">{message}</p>
  <p><Link href="/setup/credits/install">Preparar carteira (actualização única da base de dados)</Link> · <Link href="/setup/plans">Preparar preços dos planos</Link></p>
  <section className="card team-panel"><h2>Criar carteira de teste</h2><div className="workspace-toolbar">
   <button className="btn btn-primary" disabled={busy} onClick={()=>action({action:'open',plan:'individual'})}>Individual · 49 €/mês</button>
   <label>Empresa <select value={organization} onChange={e=>setOrganization(e.target.value)}><option value="">Escolher empresa</option>{teams.filter(t=>t.role==='owner').map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <button className="btn btn-secondary" disabled={busy||!organization} onClick={()=>action({action:'open',plan:'business',organizationId:organization})}>Empresas · 99 €/mês · 3 lugares</button>
  </div><p>Preços base, acresce IVA quando aplicável. A mensalidade não adiciona créditos. Configure a empresa em <Link href="/team">Equipa</Link> se ainda não aparecer.</p></section>
  {wallets.map(w=>{const team=teams.find(t=>t.id===w.organization_id);return <section className="card team-panel" key={w.id}>
   <h2>{w.plan==='business'?`Empresa — ${team?.name||'saldo partilhado'}`:'Individual'}</h2>
   <p>{w.frozen?'Bloqueada para revisão':w.active_until&&Date.parse(w.active_until)>Date.now()?'Subscrição de teste activa':'Sem subscrição de teste activa'}</p>
   <p><strong>Disponível: {money(w.available_cents)}</strong> · Reservado: {money(w.reserved_cents)} · Saldo total: {money(w.balance_cents)}</p>
   <div className="workspace-toolbar">
    <button className="btn btn-primary" disabled={busy||w.frozen||!!(w.active_until&&Date.parse(w.active_until)>Date.now())} onClick={()=>action({action:'checkout',walletId:w.id,kind:'access'})}>Subscrever em teste</button>
    <button className="btn btn-secondary" disabled={busy} onClick={()=>action({action:'portal',walletId:w.id})}>Gerir ou cancelar subscrição</button>
    <label>Carregamento simulado (€)<input type="number" min="1" max="500" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <button className="btn btn-secondary" disabled={busy||w.frozen||!w.active_until||Date.parse(w.active_until)<=Date.now()||!Number.isFinite(Number(amount))||Number(amount)<1||Number(amount)>500} onClick={()=>action({action:'checkout',walletId:w.id,kind:'credits',amountCents:Math.round(Number(amount)*100)})}>Comprar créditos de teste</button>
    <button className="btn btn-secondary" disabled={busy||w.frozen} onClick={()=>action({action:'simulate',walletId:w.id,requestId:crypto.randomUUID()})}>Simular consumo de 0,30 €</button>
   </div><p>A simulação reserva 0,60 €, desconta 0,30 € (custo fictício de 0,10 € × 3) e liberta 0,30 €. Não chama a IA.</p>
   {team&&<><h3>Utilizadores do saldo partilhado ({w.seats.length}/3)</h3>{team.members.map(m=><p key={m.id}>{m.email} {m.role==='owner'?'— titular':<button className="btn btn-secondary" disabled={busy} onClick={()=>action({action:'seat',walletId:w.id,memberId:m.id,add:!w.seats.some(s=>s.user_id===m.id)})}>{w.seats.some(s=>s.user_id===m.id)?'Retirar lugar':'Atribuir lugar'}</button>}</p>)}</>}
   {team&&w.seats.filter(s=>!team.members.some(m=>m.id===s.user_id)).map(s=><p key={s.user_id}>Lugar de antigo membro (sem acesso ao saldo) <button className="btn btn-secondary" disabled={busy} onClick={()=>action({action:'seat',walletId:w.id,memberId:s.user_id,add:false})}>Retirar lugar</button></p>)}
   <h3>Movimentos recentes</h3>{w.ledger.length?<ul>{w.ledger.map(l=><li key={l.source}>{l.delta_cents>0?'Carregamento':'Consumo'}: {money(l.delta_cents)} · {new Date(l.created_at).toLocaleString('pt-PT')}</li>)}</ul>:<p>Ainda sem movimentos.</p>}
  </section>;})}
 </>;
}
