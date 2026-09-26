"use client";
import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy,PDFDocumentLoadingTask} from 'pdfjs-dist';
import type {Worker} from 'tesseract.js';
import {AppShell} from './app-shell';
import {ReportActions} from './report-actions';
import {useUnsavedWork} from './use-unsaved-work';
import {createClient} from '@/lib/supabase/client';
type PageText={page:number;text:string;method:'text'|'ocr';confidence?:number};
export function DocumentWorkbench(){
 const [pages,setPages]=useState<PageText[]>([]),[name,setName]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[query,setQuery]=useState(''),[selected,setSelected]=useState(1);
 const pdf=useRef<PDFDocumentProxy|null>(null),loadingTask=useRef<PDFDocumentLoadingTask|null>(null),worker=useRef<Worker|null>(null),epoch=useRef(0),canvas=useRef<HTMLCanvasElement>(null);
 useUnsavedWork(pages.length>0);
 useEffect(()=>{const subscription=createClient()?.auth.onAuthStateChange(event=>{if(event!=='SIGNED_OUT'&&event!=='SIGNED_IN')return;epoch.current++;void loadingTask.current?.destroy();void worker.current?.terminate();pdf.current=null;loadingTask.current=null;worker.current=null;setPages([]);setName('');setQuery('');setStatus('');setBusy(false);});return()=>{epoch.current++;void loadingTask.current?.destroy();void worker.current?.terminate();subscription?.data.subscription.unsubscribe();};},[]);
 useEffect(()=>{const target=canvas.current,document=pdf.current;if(!target||!document)return;let stopped=false;let task:{cancel:()=>void}|undefined;
  void document.getPage(selected).then(page=>{if(stopped)return;const first=page.getViewport({scale:1});const viewport=page.getViewport({scale:Math.min(1.5,1000/first.width)});target.width=viewport.width;target.height=viewport.height;task=page.render({canvas:target,viewport});return (task as ReturnType<typeof page.render>).promise;}).catch(()=>{});
  return()=>{stopped=true;task?.cancel();};
 },[selected,pages.length]);
 async function open(file:File){
  if(pages.length&&!confirm('Substituir o documento local? Exporte primeiro o que pretende conservar.'))return;
  const v=++epoch.current;setBusy(true);setPages([]);setName(file.name);setStatus('A ler PDF no dispositivo…');await pdf.current?.loadingTask.destroy();pdf.current=null;
  try{if(file.size>20*1024*1024||file.size<5)throw Error('O PDF deve ter até 20 MB.');const bytes=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('O ficheiro não é PDF.');
   const lib=await import('pdfjs-dist');if(v!==epoch.current)return;lib.GlobalWorkerOptions.workerSrc='/document-runtime/pdf.worker.min.mjs';
   const task=lib.getDocument({data:bytes,cMapUrl:'/document-runtime/cmaps/',cMapPacked:true,standardFontDataUrl:'/document-runtime/standard_fonts/',wasmUrl:'/document-runtime/wasm/'});
   loadingTask.current=task;
   // Fail promptly for encrypted documents: never leave a password prompt hanging.
   task.onPassword=()=>{void task.destroy();};
   const doc=await task.promise;if(v!==epoch.current){await doc.loadingTask.destroy();return;}pdf.current=doc;if(doc.numPages>200)throw Error('Limite de 200 páginas por documento. Divida-o em partes.');
   const result:PageText[]=[];let chars=0;
   for(let n=1;n<=doc.numPages;n++){if(v!==epoch.current)return;setStatus(`A extrair página ${n} de ${doc.numPages}…`);const page=await doc.getPage(n),content=await page.getTextContent();
    const text=content.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('').trim();chars+=text.length;if(chars>500000)throw Error('Limite de 500 000 caracteres. Divida o documento.');result.push({page:n,text,method:'text'});page.cleanup();
   }
   if(v!==epoch.current)return;setPages(result);setSelected(1);setStatus(`${doc.numPages} páginas lidas. ${result.filter(p=>p.text.length<40).length} com pouco texto: use OCR nessas páginas. A ordem de leitura, tabelas e notas exigem conferência visual.`);
  }catch(e){if(v===epoch.current){setStatus(e instanceof Error?e.message:'Não foi possível ler o PDF.');await pdf.current?.loadingTask.destroy();pdf.current=null;}}finally{if(v===epoch.current)setBusy(false);}
 }
 async function ocr(){const doc=pdf.current;if(!doc||busy)return;const v=++epoch.current;let activeWorker:Worker|null=null;let surface:HTMLCanvasElement|null=null;setBusy(true);setStatus('A carregar OCR português/inglês no dispositivo…');
  try{const {createWorker}=await import('tesseract.js');if(v!==epoch.current)return;activeWorker=await createWorker(['por','eng'],1,{workerPath:'/document-runtime/worker.min.js',corePath:'/document-runtime',langPath:'/document-runtime',workerBlobURL:false,cacheMethod:'none',logger:m=>{if(v===epoch.current)setStatus(`OCR página ${selected}: ${m.status} ${Math.round((m.progress??0)*100)}%`);}});
   if(v!==epoch.current)return;worker.current=activeWorker;
   const page=await doc.getPage(selected),base=page.getViewport({scale:1}),scale=Math.min(2.4,Math.sqrt(8000000/(base.width*base.height))),viewport=page.getViewport({scale});surface=document.createElement('canvas');surface.width=viewport.width;surface.height=viewport.height;
   await page.render({canvas:surface,viewport}).promise;if(v!==epoch.current)return;const result=await activeWorker.recognize(surface);
   if(v!==epoch.current)return;if(result.data.text.length>60000)throw Error('Texto excessivo nesta página.');setPages(prior=>prior.map(p=>p.page===selected?{page:selected,text:result.data.text,method:'ocr',confidence:result.data.confidence}:p));setStatus(`OCR concluído; confiança estimada ${Math.round(result.data.confidence)}%. ${result.data.confidence<80?'Qualidade baixa: reveja as zonas ilegíveis.':'Compare sempre com a imagem.'}`);
  }catch(e){if(v===epoch.current)setStatus(e instanceof Error?e.message:'OCR interrompido.');}finally{if(surface)surface.width=surface.height=0;await activeWorker?.terminate().catch(()=>{});if(worker.current===activeWorker)worker.current=null;if(v===epoch.current)setBusy(false);}
 }
 const visible=pages.filter(p=>!query||p.text.toLocaleLowerCase('pt-PT').includes(query.toLocaleLowerCase('pt-PT'))),current=pages.find(p=>p.page===selected);
 const report=pages.map(p=>`[Página ${p.page} · ${p.method}${p.confidence!==undefined?' · confiança OCR '+Math.round(p.confidence)+'%':''}]\n${p.text||'[Texto não extraído / página por conferir]'}`).join('\n\n');
 return <AppShell><div className="eyebrow">Documentos privados · processamento local</div><h1>Leitura e OCR documental</h1><p>PDF até 20 MB e 200 páginas. Texto, pesquisa por página e OCR em português/inglês sem enviar o documento para a IA. A extração não certifica fidelidade nem interpreta tabelas juridicamente.</p><section className="card team-panel"><label>Escolher PDF<input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void open(f);}}/></label><p role="status" aria-live="polite">{status}</p>{busy&&<><progress aria-label="A processar documento"/><button onClick={()=>{epoch.current++;void worker.current?.terminate();void loadingTask.current?.destroy();pdf.current=null;loadingTask.current=null;worker.current=null;setBusy(false);setStatus('Processamento interrompido. O texto já extraído mantém-se; reabra o PDF para continuar.');}}>Interromper</button></>}{pages.length>0&&<><h2>{name}</h2><ReportActions title={name} text={report}/><label>Pesquisar em todas as páginas<input value={query} maxLength={200} onChange={e=>setQuery(e.target.value)}/></label><p>{visible.length} páginas encontradas.</p><div className="document-grid"><div><label>Página<select value={selected} disabled={busy} onChange={e=>setSelected(Number(e.target.value))}>{pages.map(p=><option key={p.page} value={p.page}>{p.page}{p.text.length<40?' · pouco texto':''}{p.method==='ocr'?' · OCR':''}</option>)}</select></label><div className="page-matches">{visible.map(p=><button key={p.page} disabled={busy} onClick={()=>setSelected(p.page)}>Página {p.page}</button>)}</div><button disabled={busy||!pdf.current} className="btn btn-primary" onClick={()=>void ocr()}>Ler esta página com OCR</button><p>{current?.method==='ocr'?`Confiança OCR: ${Math.round(current.confidence??0)}%.`:'Texto extraído do PDF; ordem e completude não garantidas.'}</p><textarea aria-label="Texto da página — corrigir após conferência" rows={20} disabled={busy} maxLength={60000} value={current?.text??''} onChange={e=>setPages(prior=>prior.map(p=>p.page===selected?{...p,text:e.target.value}:p))}/></div><canvas ref={canvas} aria-label={'Imagem original da página '+selected}/></div><p>Para conservar e pesquisar no dossier, copie o texto revisto e adicione um registo «Texto documental», indicando o documento e as páginas. O original continua separado e não é alterado.</p></>}</section></AppShell>;
}
