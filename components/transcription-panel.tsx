"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS, audioExtension } from '@/lib/transcription';
import { downloadReport } from './assistant-panel';

export function TranscriptionPanel(){
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[text,setText]=useState(''),[error,setError]=useState('');
 const [consent,setConsent]=useState(false),[recording,setRecording]=useState(false),[starting,setStarting]=useState(false),[busy,setBusy]=useState(false),[seconds,setSeconds]=useState(0),[language,setLanguage]=useState('auto');
 const [status,setStatus]=useState({enabled:false,message:'A verificar a conta e disponibilidade…',login:false});
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setInterval>|null>(null),epoch=useRef(0),pending=useRef(false),request=useRef<AbortController|null>(null),user=useRef<string|null>(null),asking=useRef(false);
 function stop(){if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(timer.current)clearInterval(timer.current);timer.current=null;}
 function clear(){epoch.current++;stop();request.current?.abort();setFile(null);setText('');setConsent(false);setError('');setRecording(false);setSeconds(0);}
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 useEffect(()=>{
  let alive=true;let version=0;const client=createClient();
  async function check(){const v=++version;try{const auth=await client?.auth.getUser();if(!alive||v!==version)return;const id=auth?.data.user?.id||null;if(user.current!==id){clear();user.current=id;}if(!id){setStatus({enabled:false,message:'Entre para gravar ou transcrever.',login:true});return;}const r=await fetch('/api/transcription');const d=await r.json();if(!alive||v!==version)return;setStatus({enabled:r.ok&&d.enabled===true,message:d.message||d.error||'',login:r.status===401});}catch{if(alive&&v===version)setStatus({enabled:false,message:'Não foi possível verificar o serviço. Recarregue a página.',login:false});}}
  const leave=()=>{epoch.current++;stop();request.current?.abort();setFile(null);setText('');setRecording(false);setConsent(false);};
  window.addEventListener('pagehide',leave);
  void check();const subscription=client?.auth.onAuthStateChange(()=>{void check();});
  return()=>{alive=false;epoch.current++;stop();request.current?.abort();window.removeEventListener('pagehide',leave);subscription?.data.subscription.unsubscribe();};
 // All cleanup uses refs; account changes discard the previous account's audio/text.
 },[]);
 function choose(value:File|null){clear();if(!value)return;try{audioExtension(value.name);if(!value.size||value.size>MAX_AUDIO_BYTES)throw Error('Escolha um ficheiro não vazio até 3 MB.');setFile(value);}catch(e){setError(e instanceof Error&&e.message!=='FORMAT'?e.message:'Formato não suportado. Use MP3, M4A, MP4, WAV ou WebM.');}}
 async function start(){
  if(asking.current||pending.current||recording||!consent||!user.current)return;
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
 async function transcribe(){if(pending.current||!file||!consent||!status.enabled)return;pending.current=true;setBusy(true);setError('');setText('');const version=epoch.current;const controller=new AbortController();request.current=controller;
  try{const r=await fetch('/api/transcription',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/octet-stream','x-request-id':crypto.randomUUID(),'x-audio-consent':'true','x-audio-extension':audioExtension(file.name),'x-audio-language':language},body:file});const d=await r.json();if(version!==epoch.current)return;if(!r.ok)throw Error(d.error||'Não foi possível transcrever.');setText(d.text);}
  catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'Ligação interrompida. A tentativa pode ter tido custos.');}finally{pending.current=false;setBusy(false);request.current=null;}
 }
 return <section className="card team-panel">
  <p role="status">{status.message} {status.login&&<Link href="/login?next=/transcription">Entrar</Link>}</p>
  <p>Ficheiros até 3 MB: MP3, M4A/MP4, WAV, MPEG/MPGA e WebM. Gravação directa até cinco minutos, não em tempo real. O limite de tamanho também se aplica à gravação.</p>
  <p>O áudio fica apenas nesta página até carregar em Transcrever. O site não guarda o áudio nem o texto automaticamente; o fornecedor tem as suas próprias regras de retenção. Ao sair ou mudar de conta, perde o conteúdo não exportado.</p>
  <label htmlFor="audio-upload">Carregar áudio</label><input id="audio-upload" type="file" accept={AUDIO_ACCEPT} disabled={busy||recording||starting} onChange={e=>{choose(e.target.files?.[0]||null);e.target.value='';}}/>
  <label className="analysis-consent"><input type="checkbox" checked={consent} disabled={busy||recording||starting} onChange={e=>setConsent(e.target.checked)}/>Tenho autorização para gravar e partilhar este áudio, incluindo as permissões necessárias dos participantes. Autorizo o envio à OpenAI apenas ao clicar em Transcrever. Não incluirei segredos profissionais ou dados que não possa partilhar.</label>
  <div className="workspace-toolbar"><button className="btn btn-secondary" disabled={!consent||!user.current||busy||recording||starting} onClick={()=>void start()}>{starting?'A pedir microfone…':'Gravar com microfone'}</button><button className="btn btn-secondary" disabled={!recording} onClick={stop}>Parar gravação</button></div>
  {recording&&<p role="status">A gravar — {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} / 5:00. O microfone está activo.</p>}
  {file&&<div><p>{file.name} — {(file.size/1024/1024).toFixed(2)} MB</p>{preview&&<audio aria-label="Ouvir áudio antes de enviar" controls src={preview}/>}<p><a className="btn btn-secondary" href={preview} download={file.name}>Descarregar áudio</a></p></div>}
  <label htmlFor="audio-language">Idioma falado</label><select id="audio-language" value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}><option value="auto">Detectar automaticamente</option><option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option><option value="fr">Francês</option></select>
  <button className="btn btn-primary" disabled={!status.enabled||!file||!consent||busy||recording||starting} onClick={()=>void transcribe()}>{busy?'A transcrever…':'Transcrever'}</button> <button className="btn btn-secondary" disabled={busy||starting} onClick={clear}>Apagar áudio e texto desta página</button>
  {error&&<p role="alert">{error}</p>}
  {text&&<section><h2>Transcrição para revisão</h2><p>Pode conter omissões ou palavras incorrectas. Confira nomes, números e termos jurídicos no áudio. Sem identificação garantida de intervenientes ou marcações temporais.</p><label htmlFor="transcript-text">Texto editável</label><textarea id="transcript-text" rows={14} maxLength={60000} value={text} onChange={e=>setText(e.target.value)}/><button className="btn btn-secondary" onClick={()=>downloadReport('LIC — Transcrição não certificada; revisão humana necessária.\n\n'+text,'transcricao-lic.txt')}>Exportar texto (.txt)</button></section>}
 </section>;
}
