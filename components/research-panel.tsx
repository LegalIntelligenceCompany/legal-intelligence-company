"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@/lib/supabase/client';
import {profiles,reportText,type AssistantResult} from '@/lib/assistant';
import {Answer,downloadReport} from './assistant-panel';
import {SaveResearch} from './save-research';
import {researchModels} from '@/lib/research-models';
type Job={id:string;question:string;state:string;model:string;error?:string;result?:AssistantResult};
const stages:Record<string,string>={starting:'A iniciar a pesquisa',draft:'A pesquisar fontes e elaborar a resposta',review_starting:'A iniciar a revisão crítica',review:'A rever fundamentos e fontes',completed:'Resposta concluída',failed:'Pedido interrompido'};
export function ResearchPanel(){
 const [model,setModel]=useState('gpt-5-mini');
 const [ready,setReady]=useState(false),[loading,setLoading]=useState(true),[question,setQuestion]=useState(''),[profile,setProfile]=useState('Geral'),[country,setCountry]=useState('Portugal'),[consent,setConsent]=useState(false),[job,setJob]=useState<Job|null>(null),[error,setError]=useState(''),[sending,setSending]=useState(false),[polling,setPolling]=useState(true);
 const mounted=useRef(true),busy=useRef(false),owner=useRef<string|null>(null),version=useRef(0);
 const active=!!job&&!['completed','failed'].includes(job.state);
 async function recover(){const v=version.current;try{const r=await fetch('/api/research',{cache:'no-store'});const data=await r.json();if(!mounted.current||v!==version.current)return;if(!r.ok)throw Error(data.error);setJob(data.job);setError('');setPolling(true);}catch(e){if(mounted.current&&v===version.current)setError(e instanceof Error?e.message:'Não foi possível recuperar o pedido.');}}
 useEffect(()=>{mounted.current=true;const client=createClient();if(!client){setLoading(false);return;}
  const auth=(id:string|null)=>{if(owner.current!==id){version.current++;owner.current=id;setJob(null);setQuestion('');setConsent(false);setError('');}setReady(!!id);setLoading(false);if(id)void recover();};
  client.auth.getUser().then(({data})=>{if(mounted.current)auth(data.user?.id??null);}).catch(()=>setLoading(false));
  const {data}=client.auth.onAuthStateChange((_e,s)=>{if(mounted.current&&owner.current!==(s?.user.id??null))auth(s?.user.id??null);});
  return()=>{mounted.current=false;version.current++;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{if(!active||!polling||!ready||!job)return;const id=job.id,v=version.current;let alive=true;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{const r=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'advance',id})});const data=await r.json();if(!alive||v!==version.current)return;if(!r.ok)throw Error(data.error);setJob(data.job);setError('');}catch(e){if(alive&&v===version.current){setError((e instanceof Error?e.message:'Ligação interrompida.')+' Use Recuperar pesquisa; isso não reenvia a pergunta.');setPolling(false);}}finally{if(alive)timer=setTimeout(poll,5000);}};
  timer=setTimeout(poll,1000);return()=>{alive=false;clearTimeout(timer);};
 },[job?.id,job?.state,active,polling,ready]);
 async function send(e:React.FormEvent){e.preventDefault();if(busy.current||active||!consent||!ready)return;busy.current=true;setSending(true);setError('');const v=version.current;
  try{const r=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',backgroundConsent:true,model,input:{requestId:crypto.randomUUID(),mode:'research',profile,country,question:question.trim(),history:[],documentIds:[],consent:true}})});const data=await r.json();if(!mounted.current||v!==version.current)return;if(!r.ok)throw Error(data.error);setJob(data.job);setPolling(true);}
  catch(e){if(mounted.current&&v===version.current)setError((e instanceof Error?e.message:'Não foi possível confirmar o pedido.')+' Antes de reenviar, use Recuperar pesquisa.');}
  finally{busy.current=false;if(mounted.current)setSending(false);}
 }
 return <div className="assistant-layout research-workspace"><aside className="card team-panel assistant-options">
 <div className="eyebrow">O seu espaço jurídico</div><h2>Configurar pesquisa</h2>
 <label htmlFor="research-profile">Explicação adaptada a</label><select id="research-profile" value={profile} disabled={active||sending} onChange={e=>setProfile(e.target.value)}>{profiles.map(p=><option key={p}>{p}</option>)}</select>
 <label htmlFor="research-country">Jurisdição</label><select id="research-country" value={country} disabled={active||sending} onChange={e=>setCountry(e.target.value)}><option>Portugal</option><option>União Europeia</option></select>
 <label htmlFor="research-model">Motor de pesquisa</label><select id="research-model" value={model} disabled={active||sending} onChange={e=>{setModel(e.target.value);setConsent(false);}}>{researchModels.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select>
 <p className="assistant-small">{model==='gpt-5-mini'?'Pesquisa e revisão com GPT-5 mini, ambas com consulta web. Reserva: 1,50 €.':'Pesquisa com GPT-5 mini e revisão crítica com GPT-6 Astra, sem nova consulta web pelo revisor. Reserva: 4,50 €.'} A reserva não é uma factura; mantém-se se o pedido falhar. Só a conta de teste está autorizada.</p>
 <p className="assistant-small">As versões dentro destas famílias seguem o fornecedor. Novas famílias não são activadas automaticamente sem validação de qualidade e custo.</p>
 <Link className="source-link" href="/setup/pilot">Consultar orçamento</Link><hr/><p className="assistant-small">Fontes e vigência devem ser confirmadas no original. Nenhum modo equivale a validação por jurista. Para documentos confidenciais, utilize as ferramentas privadas.</p><Link href="/tools" className="btn btn-secondary">Documentos privados</Link></aside>
 <section className="card team-panel assistant-main"><div className="research-heading"><span className="research-orb" aria-hidden="true">LI</span><div><div className="eyebrow">Pesquisa com fontes · revisão crítica</div><h2>O que vamos esclarecer?</h2></div></div><p>Legislação, jurisprudência e conceitos jurídicos. Pergunte, acompanhe a pesquisa e confira os fundamentos.</p>
 {loading?<p role="status">A verificar a sessão…</p>:!ready?<Link className="btn btn-primary" href="/login?next=/chat">Entrar para pesquisar</Link>:<>
 <div className="workspace-toolbar"><button type="button" className="btn btn-secondary" disabled={sending} onClick={()=>void recover()}>Recuperar pesquisa</button><Link className="source-link" href="/setup/research">Configuração da pesquisa</Link></div>
 {job&&<article className="assistant-turn"><h3 className="assistant-question">{job.question}</h3><div role="status" className="research-status"><strong>{stages[job.state]||job.state}</strong>{active&&<><progress aria-label="Pesquisa em curso"/><p>Pode demorar vários minutos. Consultamos o mesmo pedido, sem o reenviar. Se fechar a página, reabra em poucos minutos para retomar a revisão.</p></>}</div>{job.error&&<p role="alert" className="workspace-error">{job.error}</p>}{job.result&&<><p className="assistant-small">{job.model} · Segunda passagem concluída · {new Date(job.result.generatedAt).toLocaleString('pt-PT')}</p><Answer result={job.result}/><SaveResearch question={job.question} result={job.result}/><button className="btn btn-secondary" onClick={()=>downloadReport(reportText(job.result!),'pesquisa-lic.txt')}>Exportar resposta e fontes</button></>}</article>}
 {error&&<p className="workspace-error" role="alert">{error}</p>}
 <form onSubmit={send}><label htmlFor="research-question">A sua pergunta</label><textarea id="research-question" rows={5} required maxLength={4000} disabled={active||sending} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ex.: Quais são os requisitos de validade de uma cláusula de não concorrência em Portugal?"/><label className="analysis-consent"><input type="checkbox" required checked={consent} disabled={active||sending} onChange={e=>setConsent(e.target.checked)}/><span>Autorizo o envio desta pergunta pública à OpenAI e aos fornecedores de pesquisa, incluindo a revisão. Não incluo dados pessoais ou confidenciais. Aceito a retenção temporária necessária à recuperação e os custos dentro do orçamento autorizado.</span></label><p className="assistant-small">O fornecedor conserva temporariamente o pedido em segundo plano (cerca de 10 minutos, mesmo com store:false). A pesquisa fica recuperável na conta até 24 horas; registos expirados são eliminados no próximo pedido. Interrupções não devolvem automaticamente a reserva. Cada pergunta é independente.</p><button className="btn btn-primary" disabled={active||sending||!consent||!question.trim()}>{sending?'A registar pedido…':active?'Pesquisa em curso':'Pesquisar com fontes'}</button></form></>}
 </section></div>;
}
