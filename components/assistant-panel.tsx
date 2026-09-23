"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { workflows, type Workflow } from "@/lib/services";
import { SaveResearch } from './save-research';
import {readAssistantResponse,assistantStages} from '@/lib/assistant-stream';
import {useServiceFunding} from './service-funding';
import { calendarReminder, profiles, reportText, type AssistantMode, type AssistantResult } from "@/lib/assistant";

export function downloadReport(text: string, name: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Answer({ result }: { result: AssistantResult }) {
  const parts: React.ReactNode[] = []; let last = 0;
  result.citations.forEach((c, i) => { parts.push(result.text.slice(last, c.start)); parts.push(<a className="source-link" key={i} href={c.url} target="_blank" rel="noopener noreferrer">[{i + 1}: {c.title.trim() || 'Consultar fonte'}]</a>); last = c.end; });
  parts.push(result.text.slice(last));
  return <div className="assistant-answer">{parts}</div>;
}
const starters = ["Como encontrar a versão em vigor de uma lei portuguesa?", "Explica a diferença entre jurisprudência e legislação, com fontes.", "Ajuda-me a pesquisar acórdãos sobre cláusulas contratuais gerais."];

export function AssistantPanel({ organizationId, workflow }: { organizationId?: string; workflow?: Workflow }) {
  const [mode, setMode] = useState<AssistantMode>(workflow === "meeting" ? "private-text" : workflow === "evidence" || workflow === "dossier-search" ? "collection" : workflow === "timeline" ? "timeline" : organizationId ? "document" : "research");
  const funding=useServiceFunding(mode==='research'?'assistant-research':'document');
  const [profile, setProfile] = useState<typeof profiles[number]>("Geral");
  const [country, setCountry] = useState("Portugal");
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [session, setSession] = useState<"loading" | "ready" | "login">("loading");
  const [documents, setDocuments] = useState<{ id: string; filename: string }[]>([]);
  const [documentA, setDocumentA] = useState(""); const [documentB, setDocumentB] = useState("");
  const [turns, setTurns] = useState<{ question: string; result: AssistantResult }[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [date, setDate] = useState(""); const [title, setTitle] = useState(""); const [dateConfirmed, setDateConfirmed] = useState(false);
  const [format, setFormat] = useState<string>(workflow ? workflows[workflow].formats[0] : "");
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [material, setMaterial] = useState("");
  const [stage,setStage]=useState('checking');
  const [elapsed,setElapsed]=useState(0);
  const activeRequest=useRef<AbortController|null>(null);
  const multiDocument = mode === "timeline" || mode === "collection";
  const pending = useRef(false); const epoch = useRef(0); const user = useRef<string | null>(null);
  useEffect(() => {
    let alive = true; const client = createClient();
    if (!client) { setSession("login"); return; }
    async function load(id: string | null) {
      if (!alive) return;
      if (user.current !== id) { setMaterial(""); epoch.current++; setTurns([]); setQuestion(""); setConsent(false); setDocuments([]); setDocumentA(""); setDocumentB(""); setSelectedDocuments([]); setError(""); setDate(""); setTitle(""); setDateConfirmed(false); }
      user.current = id; setSession(id ? "ready" : "login");
      if (id && organizationId) {
        const result = await client!.from("contracts").select("id,filename").eq("organization_id", organizationId).eq("status", "uploaded").eq("mime_type", "application/pdf").order("created_at", { ascending: false }).limit(100);
        if (!alive || user.current !== id) return;
        if (result.error) setError("Não foi possível carregar os documentos. Actualize a página.");
        else setDocuments(result.data ?? []);
      }
    }
    client.auth.getUser().then(({ data }) => load(data.user?.id ?? null)).catch(() => { if (alive) setSession("login"); });
    const { data } = client.auth.onAuthStateChange((_event, s) => { setTimeout(() => { void load(s?.user.id ?? null); }, 0); });
    return () => { alive = false; epoch.current++; activeRequest.current?.abort(); data.subscription.unsubscribe(); };
  }, [organizationId]);
  function clear() { epoch.current++; setTurns([]); setQuestion(""); setError(""); setConsent(false); setDate(""); setTitle(""); setDateConfirmed(false); }
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (pending.current || session !== "ready" || !funding.ready) return;
    pending.current = true; setBusy(true); setError("");setStage('checking');setElapsed(0); const version = epoch.current; const asked = question.trim();
    const controller=new AbortController();activeRequest.current=controller;const started=Date.now();
    const clock=setInterval(()=>{if(epoch.current===version)setElapsed(Math.floor((Date.now()-started)/1000));},1000);
    const timeout=setTimeout(()=>controller.abort(),175000);
    try {
      const history = turns.slice(-2).flatMap(t => [{ role: "user", content: t.question }, { role: "assistant", content: t.result.text.slice(0, 10000) }]);
      const response = await fetch("/api/assistant", { method: "POST",signal:controller.signal, headers: { "Content-Type": "application/json",Accept:'application/x-ndjson',...funding.headers }, body: JSON.stringify({ requestId: crypto.randomUUID(), mode, profile, country, question: asked, history, consent, organizationId, ...(workflow ? {workflow, format} : {}), ...(mode === "private-text" ? {material} : {}), documentIds: mode === "research" || mode === "private-text" ? [] : multiDocument ? selectedDocuments : mode === "compare" ? [documentA, documentB] : [documentA] }) });
      const data = await readAssistantResponse(response,next=>{if(epoch.current===version)setStage(next);}); if (epoch.current !== version) return;
      if (!response.ok || !data.result) { setError(data.error ?? "Não foi possível concluir o pedido."); return; }
      const result=data.result;setTurns(old => [...old, { question: asked, result }]); setQuestion("");
    } catch { if (epoch.current === version) setError((controller.signal.aborted?'A espera atingiu o limite.':'A ligação foi interrompida antes de recebermos uma resposta completa.')+' Não repetimos o pedido. O servidor pode ainda estar a processar e a reserva mantém-se. Consulte o orçamento antes de outra tentativa.'); }
    finally { clearInterval(clock);clearTimeout(timeout);activeRequest.current=null;pending.current = false; setBusy(false);funding.refresh(); }
  }
  function calendar() {
    try { downloadReport(calendarReminder(title, date), "prazo-confirmado.ics", "text/calendar;charset=utf-8"); }
    catch { setError("Preencha um título e uma data válida, confirmada no documento."); }
  }
  return <div className="assistant-layout">
    <aside className="card team-panel assistant-options">
      <h2>{organizationId ? "Ferramentas documentais" : "A sua pesquisa"}</h2>
      {workflow && <><h3>{workflows[workflow].title}</h3><p>{workflows[workflow].description}</p><label htmlFor="service-format">Formato</label><select id="service-format" disabled={busy} value={format} onChange={e => { clear(); setFormat(e.target.value); }}>{workflows[workflow].formats.map(f => <option key={f}>{f}</option>)}</select></>}
      {multiDocument && <fieldset><legend>Escolha até cinco PDFs</legend>{documents.map(d => <label className="analysis-consent" key={d.id}><input type="checkbox" checked={selectedDocuments.includes(d.id)} disabled={busy || (!selectedDocuments.includes(d.id) && selectedDocuments.length >= 5)} onChange={e => { clear(); setSelectedDocuments(old => e.target.checked ? [...old, d.id] : old.filter(id => id !== d.id)); }}/>{d.filename}</label>)}</fieldset>}
      {multiDocument && <><p>Até 10 MB no total. Sem pesquisa web. A ordem de selecção define as letras usadas na resposta:</p><ol>{selectedDocuments.map((id,i)=><li key={id}>Documento {String.fromCharCode(65+i)} — {documents.find(d=>d.id===id)?.filename}</li>)}</ol></>}
      {organizationId && !workflow && <><label htmlFor="assistant-mode">Serviço</label><select id="assistant-mode" disabled={busy} value={mode} onChange={e => { clear(); setMode(e.target.value as AssistantMode); }}><option value="document">Perguntar ao documento</option><option value="compare">Comparar versões</option><option value="obligations">Extrair obrigações e prazos</option></select></>}
      <label htmlFor="assistant-profile">Adaptar a explicação a</label><select id="assistant-profile" disabled={busy} value={profile} onChange={e => { clear(); setProfile(e.target.value as typeof profiles[number]); }}>{profiles.map(p => <option key={p}>{p}</option>)}</select>
      <label htmlFor="assistant-country">Direito a pesquisar / contexto</label><select id="assistant-country" disabled={busy} value={country} onChange={e => { clear(); setCountry(e.target.value); }}><option>Portugal</option><option>União Europeia</option></select>
      {organizationId && !multiDocument && <><label htmlFor="document-a">{mode === "compare" ? "Documento A — versão anterior" : "Documento"}</label><select id="document-a" disabled={busy} value={documentA} onChange={e => { clear(); setDocumentA(e.target.value); }}><option value="">Escolha um PDF</option>{documents.map(d => <option key={d.id} value={d.id}>{d.filename}</option>)}</select>{mode === "compare" && <><label htmlFor="document-b">Documento B — versão posterior</label><select id="document-b" disabled={busy} value={documentB} onChange={e => { clear(); setDocumentB(e.target.value); }}><option value="">Escolha outro PDF</option>{documents.filter(d => d.id !== documentA).map(d => <option key={d.id} value={d.id}>{d.filename}</option>)}</select></>}<p>PDFs até 10 MB no total. Sem pesquisa web neste modo.</p><Link className="btn btn-secondary" href="/contracts/new">Carregar documento</Link></>}
      <p className="assistant-small">As respostas podem conter erros. Confirme fontes, vigência, excertos e aplicabilidade. Não substituem aconselhamento jurídico.</p>
      <p className="assistant-small">A conversa não é guardada automaticamente; desaparece ao sair ou recarregar. Exporte o que quiser conservar ou guarde respostas públicas num dossier. Cada pergunta inclui apenas os dois últimos pares de mensagens.</p>
      <button type="button" className="btn btn-secondary" disabled={busy || !turns.length} onClick={clear}>Limpar conversa</button>
      <p><Link className="source-link" href={organizationId ? "/chat" : "/tools"}>{organizationId ? "Abrir pesquisa jurídica" : "Trabalhar com documentos privados"}</Link></p>
    </aside>
    <section className="card team-panel assistant-main" aria-label="Conversa com o assistente">
      {!turns.length && <div><div className="eyebrow">{organizationId ? "Revisão documental" : "Direito para pesquisar, estudar e trabalhar"}</div><h2>{organizationId ? "O que pretende descobrir?" : "Como posso ajudar na sua pesquisa?"}</h2><p>{organizationId ? "Seleccione os documentos e descreva o que pretende. A comparação com políticas continua disponível na análise de cada contrato." : mode === "private-text" ? "Trabalhe sobre notas ou transcrições: perguntas propostas, acta para revisão e tarefas com suporte no texto. Sem pesquisa externa." : "Legislação, jurisprudência e conceitos jurídicos, com pesquisa na web e citações para consultar. Não é uma base exaustiva de todo o direito."}</p>{!organizationId && !workflow && <div className="assistant-starters">{starters.map(s => session === "ready" ? <button type="button" className="btn btn-secondary" key={s} onClick={() => { setQuestion(s); document.getElementById("assistant-question")?.focus(); }}>{s}</button> : <a className="btn btn-secondary" key={s} href="/login?next=/chat">{s}<span className="assistant-small"> — Entrar para perguntar</span></a>)}</div>}</div>}
      <div aria-live="polite" aria-busy={busy}>{turns.map((turn, i) => <article className="assistant-turn" key={i}><h3 className="assistant-question">{turn.question}</h3><p className="assistant-small">{turn.result.researched ? "Pesquisa web com citações · vigência a confirmar" : "Baseado nos documentos · sem pesquisa web"} · {new Date(turn.result.generatedAt).toLocaleString("pt-PT")}</p>{turn.result.review === "second-pass" && <p className="assistant-small">{turn.result.model} · Segunda revisão por IA concluída; não equivale a validação por jurista.</p>}<Answer result={turn.result}/>{mode === "research" && <SaveResearch question={turn.question} result={turn.result}/>}<button type="button" className="btn btn-secondary" onClick={() => downloadReport((multiDocument ? selectedDocuments.map((id,i)=>`Documento ${String.fromCharCode(65+i)}: ${documents.find(d=>d.id===id)?.filename??id}`).join("\n")+"\n\n" : "")+reportText(turn.result), "relatorio-lic.txt")}>Exportar resposta e fontes</button></article>)}{busy && <p role="status" className="team-notice">{mode === "research" ? "A pesquisar fontes, elaborar e rever a resposta…" : "A ler os documentos, elaborar e rever a resposta…"} Pode demorar até três minutos. Não volte a enviar.</p>}</div>
      {busy&&<div role="status"><p>{assistantStages[stage]} Tempo decorrido: {Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')}.</p><progress aria-label="Pedido em processamento"/><p>Não é uma percentagem de conclusão. Mantenha a página aberta; não repetimos pedidos automaticamente.</p></div>}
      {error && <p role="alert" className="workspace-error">{error} <Link className="source-link" href="/setup/pilot">Consultar orçamento de teste</Link>{error.includes("005") && <> <Link className="source-link" href="/setup/assistant">Instruções de activação</Link></>}</p>}
      {session === "loading" ? <p>A verificar a sessão…</p> : session === "login" ? <p className="team-notice">Entre com o seu e-mail para utilizar IA. Não precisa de empresa para pesquisar direito. <Link className="btn btn-primary" href="/login?next=/chat">Entrar</Link></p> : <form onSubmit={send}>
        {mode === "private-text" && <><p>Texto privado, sem pesquisa web. Cole notas ou uma transcrição revista (até 60 000 caracteres). Não fica guardado automaticamente. <Link href="/transcription">Abrir transcrição de áudio</Link></p><label htmlFor="meeting-material">Notas ou transcrição original</label><textarea id="meeting-material" rows={10} maxLength={60000} required disabled={busy} value={material} onChange={e => { clear(); setMaterial(e.target.value); }}/><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => {clear(); setMaterial("");}}>Apagar material e conversa</button></>}
        <label htmlFor="assistant-question">{mode === "obligations" ? "Indique as obrigações ou prazos a extrair" : "A sua pergunta"}</label><textarea id="assistant-question" rows={4} maxLength={4000} required disabled={busy} value={question} onChange={e => setQuestion(e.target.value)} placeholder={workflow ? workflows[workflow].placeholder : mode === "compare" ? "Compare as versões e identifique alterações de responsabilidade, prazos e riscos." : mode === "obligations" ? "Extraia obrigações, prazos de pagamento, renovação e denúncia, com excertos e páginas." : "Escreva a pergunta sem dados confidenciais…"}/>
        <label className="analysis-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} required/><span>{mode === "research" ? "Autorizo o envio da pergunta e do contexto à OpenAI e aos fornecedores de pesquisa. Não incluirei dados pessoais, segredos ou documentos confidenciais." : mode === "private-text" ? "Autorizo o envio das notas/transcrição, pergunta e contexto à OpenAI; tenho autorização para partilhar estes dados." : "Autorizo o envio dos PDFs seleccionados, perguntas e contexto à OpenAI; tenho autorização para partilhar estes dados."} Aceito os custos na conta API da plataforma.</span></label>
        <p className="assistant-small">20 pedidos por conta e 200 na plataforma em 24 horas, partilhados entre estes serviços. O pedido usa store:false; isso não garante retenção zero pelo fornecedor.</p>
        {!busy&&funding.panel}
        <button className="btn btn-primary" disabled={busy || !funding.ready || !consent || !question.trim() || (mode === "private-text" && !material.trim()) || (!!organizationId && (multiDocument ? selectedDocuments.length === 0 : (!documentA || (mode === "compare" && (!documentB || documentB === documentA)))))}>{busy ? "A preparar…" : "Enviar pergunta"}</button>
      </form>}
      {mode === "obligations" && turns.length > 0 && <section className="assistant-turn"><h3>Criar lembrete de um prazo confirmado</h3><p>Leia o excerto original e confirme a data. Importe o ficheiro no seu calendário; o site não envia e-mails nem acompanha prazos automaticamente.</p><label htmlFor="reminder-title">Título (evite dados confidenciais)</label><input id="reminder-title" maxLength={200} value={title} onChange={e => { setTitle(e.target.value); setDateConfirmed(false); }}/><label htmlFor="reminder-date">Data confirmada</label><input id="reminder-date" type="date" value={date} onChange={e => { setDate(e.target.value); setDateConfirmed(false); }}/><label className="analysis-consent"><input type="checkbox" checked={dateConfirmed} onChange={e => setDateConfirmed(e.target.checked)}/>Confirmei a data no documento e quero um lembrete um dia antes.</label><button className="btn btn-secondary" disabled={!dateConfirmed || !date || !title.trim()} onClick={calendar}>Exportar para calendário (.ics)</button></section>}
    </section>
  </div>;
}
