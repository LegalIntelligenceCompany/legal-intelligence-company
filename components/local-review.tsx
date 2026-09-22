"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppShell } from './app-shell';
import { downloadReport } from './assistant-panel';
import { findPersonalData, replaceCandidates, compareLegalTexts, LOCAL_TEXT_LIMIT, type Candidate, type DiffLine } from '@/lib/local-review';
import { safeSourceUrl } from '@/lib/legal-research';

export function Anonymizer(){
 const [text,setText]=useState(''),[terms,setTerms]=useState(''),[candidates,setCandidates]=useState<Candidate[]>([]),[selected,setSelected]=useState<number[]>([]),[result,setResult]=useState(''),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false);
 const feedback=useRef<HTMLDivElement>(null);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{if(attempt){feedback.current?.focus({preventScroll:true});feedback.current?.scrollIntoView({block:'center',behavior:'smooth'});}},[attempt]);
 function reset(){setCandidates([]);setSelected([]);setResult('');setError('');setReviewed(false);}
 function detect(e:React.FormEvent){
  e.preventDefault();reset();setAttempt(n=>n+1);
  if(!text.trim()){setError('Cole o texto que pretende analisar no campo “Texto original” e volte a carregar em Detectar e rever ocorrências.');return;}
  try{setCandidates(findPersonalData(text,terms.split('\n').map(t=>t.trim()).filter(Boolean)));setReviewed(true);}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível analisar o texto. Tente um excerto mais curto.');}
 }
 return <AppShell><Link href="/services">Todos os serviços</Link><h1>Anonimização assistida de texto</h1><p>Processamento local neste navegador, sem envio para a IA e sem guardar no site. Detecta padrões de e-mail, IBAN português e números de nove dígitos (possíveis telefones ou NIF). Pode falhar ou assinalar valores que não são pessoais.</p><p>Não detecta todos os nomes, moradas, dados sensíveis ou identificadores estrangeiros. Acrescente termos e reveja tudo. Substituições são pseudonimização: o contexto pode continuar a identificar pessoas. Não remove dados de PDFs, imagens ou metadados.</p>
 <noscript>Esta ferramenta precisa de JavaScript activo no navegador para analisar o texto localmente.</noscript>
 <form className="card team-panel" noValidate onSubmit={detect}>
 <label>Texto original (até 40 000 caracteres)<textarea rows={10} required maxLength={LOCAL_TEXT_LIMIT} value={text} onChange={e=>{reset();setText(e.target.value);}}/></label>
 <label>Nomes, moradas ou outros termos a procurar — um por linha, correspondência exacta<textarea rows={4} maxLength={10000} value={terms} onChange={e=>{reset();setTerms(e.target.value);}}/></label><button type="submit" className="btn btn-primary" aria-describedby="anonymizer-feedback">Detectar e rever ocorrências</button> <button type="button" className="btn btn-secondary" onClick={()=>{reset();setText('');setTerms('');}}>Apagar tudo</button>
 <div id="anonymizer-feedback" ref={feedback} tabIndex={-1} aria-live="polite">{error?<p role="alert" className="workspace-error">{error}</p>:reviewed?<p className="team-notice">{candidates.length?`Análise concluída: ${candidates.length} ocorrências encontradas. Reveja a lista abaixo e seleccione as que pretende substituir.`:'Análise concluída: nenhuma ocorrência encontrada. Para nomes ou moradas, acrescente os termos no segundo campo e volte a detectar. Isto não garante ausência de dados pessoais.'}</p>:<p>Primeiro cole o texto no campo original. O segundo campo é opcional e permite acrescentar nomes ou moradas.</p>}</div></form>
 {reviewed&&<section className="card team-panel"><h2>{candidates.length} ocorrências propostas</h2>{!candidates.length&&<p>Nenhuma ocorrência detectada não significa ausência de dados pessoais.</p>}<button className="btn btn-secondary" onClick={()=>{setSelected(candidates.map((_,i)=>i));setResult('');}}>Seleccionar todas</button> <button className="btn btn-secondary" onClick={()=>{setSelected([]);setResult('');}}>Desmarcar todas</button>
 {candidates.map((c,i)=><label key={i} className="analysis-consent"><input type="checkbox" checked={selected.includes(i)} onChange={e=>{setResult('');setSelected(old=>e.target.checked?[...old,i]:old.filter(n=>n!==i));}}/><span>{text.slice(Math.max(0,c.start-25),c.start)}<strong>{c.value}</strong>{text.slice(c.end,c.end+25)} → {c.replacement}</span></label>)}
 <button className="btn btn-primary" disabled={!selected.length} onClick={()=>{try{setResult(replaceCandidates(text,candidates.filter((_,i)=>selected.includes(i))));}catch(e){setError((e as Error).message);}}}>Substituir apenas as ocorrências seleccionadas</button></section>}
 {result&&<section className="card team-panel"><h2>Resultado — revisão humana obrigatória</h2><label>Reveja e corrija antes de exportar<textarea rows={12} value={result} onChange={e=>setResult(e.target.value)}/></label><button className="btn btn-primary" onClick={()=>downloadReport(result,'texto-revisto.txt')}>Exportar texto revisto</button><p>O ficheiro exportado não inclui o original nem a tabela de substituições. A exportação não garante anonimato.</p></section>}
 </AppShell>;
}

export function LegislationComparison(){
 const [before,setBefore]=useState(''),[after,setAfter]=useState(''),[sourceA,setSourceA]=useState(''),[sourceB,setSourceB]=useState(''),[dateA,setDateA]=useState(''),[dateB,setDateB]=useState(''),[result,setResult]=useState<DiffLine[]|null>(null),[error,setError]=useState('');
 const edit=(setter:(s:string)=>void)=>(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>{setter(e.target.value);setResult(null);setError('');};
 function report(){return `LIC — comparação literal\nVersão A: ${dateA} — ${sourceA}\nVersão B: ${dateB} — ${sourceB}\nFontes e datas indicadas pelo utilizador, não verificadas. A comparação não confirma vigência nem efeitos jurídicos. Fins de linha normalizados.\n\n`+result!.map(l=>`${l.kind==='added'?'+':l.kind==='removed'?'-':' '} ${l.text}`).join('\n');}
 return <AppShell><Link href="/services">Todos os serviços</Link><h1>Comparar versões legislativas</h1><p>Comparação literal local, linha a linha, sem IA. Cole dois textos e identifique as respectivas fontes e datas. Não consulta os endereços, não confirma autenticidade ou vigência e não interpreta efeitos jurídicos. Diferenças de formatação também podem aparecer como alterações.</p>
 <form className="card team-panel" onSubmit={e=>{e.preventDefault();setResult(null);setError('');try{if(!safeSourceUrl(sourceA)||!safeSourceUrl(sourceB))throw Error('Indique URLs públicas válidas para as fontes.');setResult(compareLegalTexts(before,after));}catch(e){setError((e as Error).message);}}}>
 <div className="legal-versions"><section><h2>Versão A</h2><label>Fonte (URL)<input type="url" required maxLength={2000} value={sourceA} onChange={edit(setSourceA)}/></label><label>Data identificada na versão<input type="date" required value={dateA} onChange={edit(setDateA)}/></label><label>Texto A<textarea required rows={14} maxLength={LOCAL_TEXT_LIMIT} value={before} onChange={edit(setBefore)}/></label></section>
 <section><h2>Versão B</h2><label>Fonte (URL)<input type="url" required maxLength={2000} value={sourceB} onChange={edit(setSourceB)}/></label><label>Data identificada na versão<input type="date" required value={dateB} onChange={edit(setDateB)}/></label><label>Texto B<textarea required rows={14} maxLength={LOCAL_TEXT_LIMIT} value={after} onChange={edit(setAfter)}/></label></section></div><p>Até 40 000 caracteres e 600 linhas por versão. Use excertos por artigo para documentos maiores. Os textos não são guardados no site.</p><button className="btn btn-primary">Comparar textos</button> <button type="button" className="btn btn-secondary" onClick={()=>{setBefore('');setAfter('');setSourceA('');setSourceB('');setDateA('');setDateB('');setResult(null);setError('');}}>Apagar tudo</button></form>
 {error&&<p role="alert">{error}</p>}{result&&<section className="card team-panel"><h2>Diferenças literais</h2><p>{result.filter(l=>l.kind==='added').length} linhas acrescentadas; {result.filter(l=>l.kind==='removed').length} retiradas. “−” pertence a A; “+” pertence a B.</p><div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{result.map((l,i)=><div key={i} style={{background:l.kind==='added'?'#e5f8eb':l.kind==='removed'?'#ffe8e8':undefined}}>{l.kind==='added'?'+':l.kind==='removed'?'−':' '} {l.text||' '}</div>)}</div><button className="btn btn-primary" onClick={()=>downloadReport(report(),'comparacao-legislativa.txt')}>Exportar comparação</button><p>Interpretação jurídica: não efectuada. Uma alteração literal não determina, por si, a alteração de direitos ou obrigações.</p></section>}
 </AppShell>;
}
