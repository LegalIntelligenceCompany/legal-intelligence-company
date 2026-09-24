"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {useUnsavedWork} from './use-unsaved-work';
import { createClient } from '@/lib/supabase/client';
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS, audioExtension } from '@/lib/transcription';
import { downloadReport } from './assistant-panel';
import {useServiceFunding} from './service-funding';

export function TranscriptionPanel(){
 const funding=useServiceFunding('transcription');
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[text,setText]=useState(''),[error,setError]=useState('');
 const [consent,setConsent]=useState(false),[recording,setRecording]=useState(false),[starting,setStarting]=useState(false),[busy,setBusy]=useState(false),[seconds,setSeconds]=useState(0),[language,setLanguage]=useState('auto');
 const [status,setStatus]=useState<{enabled:boolean;message:string;login:boolean;pilot?:boolean}>({enabled:false,message:'A verificar a conta e disponibilidade…',login:false});
 const [waiting,setWaiting]=useState(0);
 useUnsavedWork(busy||recording||!!text);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setInterval>|null>(null),epoch=useRef(0),pending=useRef(false),request=useRef<AbortController|null>(null),user=useRef<string|null>(null),asking=useRef(false);
 function stop(){if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(timer.current)clearInterval(timer.current);timer.current=null;}
 function clear(){epoch.current++;stop();request.current?.abort();setFile(null);setText('');setConsent(false);setError('');setRecording(false);setSeconds(0);}
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 useEffect(()=>{
  let alive=true;let version=0;const client=createClient();
  async function check(){const v=++version;try{const auth=await client?.auth.getUser();if(!alive||v!==version)return;const id=auth?.data.user?.id||null;if(user.current!==id){clear();user.current=id;}if(!id){setStatus({enabled:false,message:'Entre para gravar ou transcrever.',login:true});return;}const r=await fetch('/api/transcription');const d=await r.json();if(!alive||v!==version)return;setStatus({enabled:r.ok&&d.enabled===true,message:d.message||d.error||'',login:r.status===401,pilot:d.pilot===true});}catch{if(alive&&v===version)setStatus({enabled:false,message:'Não foi possível verificar o serviço. Recarregue a página.',login:false});}}
  const leave=()=>{epoch.current++;stop();request.current?.abort();setFile(null);setText('');setRecording(false);setConsent(false);};
  window.addEventListener('pagehide',leave);
  void check();const subscription=client?.auth.onAuthStateChange(()=>{void check();});
  return()=>{alive=false;epoch.current++;stop();request.current?.abort();window.removeEventListener('pagehide',leave);subscription?.data.subscription.unsubscribe();};
 // All cleanup uses refs; account changes discard the previous account's audio/text.
 },[]);
 function choose(value:File|null){clear();if(!value)return;try{audioExtension(value.name);if(!value.size||value.size>MAX_AUDIO_BYTES)throw Error('Escolha um ficheiro não vazio até 3 MB.');setFile(value);}catch(e){setError(e instanceof Error&&e.message!=='FORMAT'?e.message:'Formato não suportado. Use MP3, M4A, MP4, WAV ou WebM.');}}
 async function start(){
  if(status.pilot||asking.current||pending.current||recording||!consent||!user.current)return;
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Este navegador não permite gravar. Pode carregar um ficheiro de áudio.');return;}
  if(file&&!confirm('Substituir o áudio e texto actuais por uma nova gravação?'))return;
  asking.current=true;setStarting(true);setError('');const version=++epoch.current;
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:true});
   if(version!==epoch.current){media.getTracks().forEach(t=>t.stop());return;}stream.current=media;
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime)throw Error('Formato de gravação não suportado. Carregue um ficheiro.');
   const rec=new MediaRecorder(media,{mimeType:mime,audioBitsPerSecond:48000});recorder.current=rec;
   const chunks:Blob[]=[];let total=0;let failed=false;const began=Date.now();
   rec.ondataavailable=e=>{if(version!==epoch.current||!e.data.size)return;total+=e.data.size;if(total>MAX_AUDIO_BYTES){failed=true;setError('A gravação excedeu 3 MB. Grave um excerto mais curto.');stop();return;}chunks.push(e.data);};
   rec.onerror=()=>{failed=true;if(version===epoch.current)setError('A gravação falhou. Tente carregar um ficheiro.');stop();};
   rec.onstop=()=>{media.getTracks().forEach(t=>t.stop());if(version!==epoch.current)return;if(timer.current)clearInterval(timer.current);timer.current=null;setRecording(false);if(!failed&&chunks.length){const ext=mime.includes('mp4')?'m4a':'webm';setFile(new File(chunks,`gravacao.${ext}`,{type:mime}));}else if(!failed)setError('Não foi captado áudio.');};
   setFile(null);setText('');setSeconds(0);rec.start(1000);setRecording(true);
   timer.current=setInterval(()=>{const elapsed=Math.floor((Date.now()-began)/1000);setSeconds(elapsed);if(elapsed>=MAX_RECORDING_SECONDS)stop();},250);
  }catch(e){stop();if(version===epoch.current)setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Permissão do microfone recusada. Autorize no navegador ou carregue um ficheiro.':e instanceof Error?e.message:'Não foi possível iniciar a gravação.');}
  finally{asking.current=false;setStarting(false);}
 }
 async function transcribe(){if(pending.current||!file||!consent||!status.enabled||!funding.ready)return;pending.current=true;setBusy(true);setWaiting(0);setError('');setText('');const version=epoch.current;const controller=new AbortController();request.current=controller;
  const began=Date.now();let timedOut=false;
  const clock=setInterval(()=>{if(version===epoch.current)setWaiting(Math.floor((Date.now()-began)/1000));},1000);
  const deadline=setTimeout(()=>{timedOut=true;controller.abort();},150000);
  try{const r=await fetch('/api/transcription',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/octet-stream','x-request-id':crypto.randomUUID(),'x-audio-consent':'true','x-audio-extension':audioExtension(file.name),'x-audio-language':language,...funding.headers},body:file});const d=await r.json().catch(()=>{throw Error('O servidor não devolveu uma resposta válida. A tentativa pode ter tido custos; não repita de imediato.');});if(version!==epoch.current)return;if(!r.ok)throw Error(d.error||'Não foi possível transcrever.');if(typeof d.text!=='string'||!d.text.trim())throw Error('Não recebemos texto da transcrição. O áudio continua disponível; não repita de imediato.');setText(d.text);}
  catch(e){if(version===epoch.current)setError(controller.signal.aborted?(timedOut?'A espera excedeu 2 minutos e 30 segundos.':'Deixou de aguardar a resposta.')+' O áudio continua nesta página. O servidor pode ainda estar a processar e a tentativa pode ter custos. Não repita de imediato.':e instanceof Error&&!(e instanceof TypeError)?e.message:'A ligação foi interrompida. O áudio continua disponível. A tentativa pode ter tido custos; não repita de imediato.');}finally{clearInterval(clock);clearTimeout(deadline);pending.current=false;setBusy(false);request.current=null;}
 }
 return <section className="card team-panel">
  <p role="status">{status.message} {status.login&&<Link href="/login?next=/transcription">Entrar</Link>}</p>
  <p>{status.pilot?'Piloto económico: WAV PCM de 16 bits até 60 segundos e 3 MB; gravação directa indisponível neste teste.':'Ficheiros até 3 MB: MP3, M4A/MP4, WAV, MPEG/MPGA e WebM. Gravação directa até cinco minutos, não em tempo real. O limite de tamanho também se aplica à gravação.'}</p>
  {status.pilot&&<p><Link href="/setup/pilot">Consultar orçamento de teste</Link></p>}
  <p>O áudio fica apenas nesta página até carregar em Transcrever. O site não guarda o áudio nem o texto automaticamente; o fornecedor tem as suas próprias regras de retenção. Ao sair ou mudar de conta, perde o conteúdo não exportado.</p>
  <label htmlFor="audio-upload">Carregar áudio</label><input id="audio-upload" type="file" accept={AUDIO_ACCEPT} disabled={busy||recording||starting} onChange={e=>{choose(e.target.files?.[0]||null);e.target.value='';}}/>
  <label className="analysis-consent"><input type="checkbox" checked={consent} disabled={busy||recording||starting} onChange={e=>setConsent(e.target.checked)}/>Tenho autorização para gravar e partilhar este áudio, incluindo as permissões necessárias dos participantes. Autorizo o envio à OpenAI apenas ao clicar em Transcrever. Não incluirei segredos profissionais ou dados que não possa partilhar.</label>
  <div className="workspace-toolbar"><button className="btn btn-secondary" disabled={status.pilot||!consent||!user.current||busy||recording||starting} onClick={()=>void start()}>{starting?'A pedir microfone…':'Gravar com microfone'}</button><button className="btn btn-secondary" disabled={!recording} onClick={stop}>Parar gravação</button></div>
  {recording&&<p role="status">A gravar — {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} / 5:00. O microfone está activo.</p>}
  {file&&<div><p>{file.name} — {(file.size/1024/1024).toFixed(2)} MB</p>{preview&&<audio aria-label="Ouvir áudio antes de enviar" controls src={preview}/>}<p><a className="btn btn-secondary" href={preview} download={file.name}>Descarregar áudio</a></p></div>}
  <label htmlFor="audio-language">Idioma falado</label><select id="audio-language" value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}><option value="auto">Detectar automaticamente</option><option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option><option value="fr">Francês</option></select>
  {!busy&&funding.panel}
  <button className="btn btn-primary" disabled={!status.enabled||!funding.ready||!file||!consent||busy||recording||starting} onClick={()=>void transcribe().finally(funding.refresh)}>{busy?'A transcrever…':'Transcrever'}</button> <button className="btn btn-secondary" disabled={busy||starting} onClick={clear}>Apagar áudio e texto desta página</button>
  {busy&&<div className="card" aria-busy="true">
   <p role="status">{waiting<45?'Pedido iniciado — a enviar áudio e aguardar a transcrição.':'Ainda sem resposta — o envio ou processamento está a demorar.'}</p>
   <progress aria-label="A aguardar a transcrição"/>
   <p>Tempo decorrido: {Math.floor(waiting/60)}:{String(waiting%60).padStart(2,'0')}. Não é uma estimativa do tempo restante.</p>
   <p>Mantenha esta página aberta. O serviço não comunica uma percentagem de progresso. A espera termina ao fim de 2 minutos e 30 segundos, sem repetir o pedido automaticamente.</p>
   <button className="btn btn-secondary" onClick={()=>request.current?.abort()}>Parar de aguardar</button>
   <p>Parar a espera não garante o cancelamento do processamento nem de eventuais custos.</p>
  </div>}
  {!busy&&!text&&!error&&<p role="status">{!status.enabled?status.message:recording?'Pare a gravação antes de transcrever.':starting?'Responda ao pedido de acesso ao microfone.':!file?'Carregue um áudio ou faça uma gravação.':!consent?'Confirme a autorização acima para poder transcrever.':'Áudio pronto. Clique em Transcrever para o enviar.'}</p>}
  {text&&!busy&&<p role="status">Transcrição concluída. O texto está disponível abaixo para revisão e exportação.</p>}
  {error&&<p role="alert">{error}</p>}
  {text&&<section><h2>Transcrição para revisão</h2><p>Pode conter omissões ou palavras incorrectas. Confira nomes, números e termos jurídicos no áudio. Sem identificação garantida de intervenientes ou marcações temporais.</p><label htmlFor="transcript-text">Texto editável</label><textarea id="transcript-text" rows={14} maxLength={60000} value={text} onChange={e=>setText(e.target.value)}/><button className="btn btn-secondary" onClick={()=>downloadReport('LIC — Transcrição não certificada; revisão humana necessária.\n\n'+text,'transcricao-lic.txt')}>Exportar texto (.txt)</button><p>Para preparar uma acta ou extrair tarefas, copie o texto revisto e cole-o em <Link href="/services/meeting">Reuniões e entrevistas</Link>. Não é enviado automaticamente.</p></section>}
 </section>;
}
