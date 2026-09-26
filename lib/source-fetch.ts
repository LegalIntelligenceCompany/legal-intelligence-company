import {parseHTML} from 'linkedom';
import {createHash} from 'node:crypto';
const hosts=new Set(['diariodarepublica.pt','www.diariodarepublica.pt','dgsi.pt','www.dgsi.pt','eur-lex.europa.eu','curia.europa.eu']);
export function permittedOfficialUrl(value:unknown){
 if(typeof value!=='string'||value.length>2000||/[\u0000-\u0020]/.test(value))throw Error('SOURCE_URL');
 const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.has(u.hostname))throw Error('SOURCE_URL');u.hash='';return u.href;
}
export function extractOfficialText(html:string){
 const {document}=parseHTML(html);
 for(const node of document.querySelectorAll('script,style,noscript,iframe,svg,form,nav,header,footer'))node.remove();
 for(const node of document.querySelectorAll('p,div,section,article,h1,h2,h3,h4,li,tr,br'))node.appendChild(document.createTextNode('\n'));
 const root=document.querySelector('main,article')??document.body;
 const text=(root?.textContent??'').replace(/[\t ]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim();
 return {title:document.title.slice(0,160),text:text.slice(0,60000),truncated:text.length>60000};
}
export async function fetchOfficialSource(url:unknown,fetcher:typeof fetch=fetch){
 let target=permittedOfficialUrl(url);const signal=AbortSignal.timeout(12000);
 for(let n=0;n<4;n++){
  const response=await fetcher(target,{redirect:'manual',cache:'no-store',signal,headers:{Accept:'text/html,text/plain','User-Agent':'LIC-SourceReader/1.0 (user-requested source verification)'}});
  if(response.status>=300&&response.status<400){await response.body?.cancel();const location=response.headers.get('location');if(!location)throw Error('SOURCE_FETCH');target=permittedOfficialUrl(new URL(location,target).href);continue;}
  if(!response.ok||!/^text\/(html|plain)\b/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw Error('SOURCE_FORMAT');}
  const reader=response.body?.getReader();if(!reader)throw Error('SOURCE_FETCH');let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>2000000){await reader.cancel();throw Error('SOURCE_SIZE');}chunks.push(next.value);}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks),charset=/charset=([^;\s]+)/i.exec(response.headers.get('content-type')??'')?.[1]??'utf-8';
  const raw=new TextDecoder(charset.replace(/["']/g,'')).decode(bytes);
  const extracted=response.headers.get('content-type')!.startsWith('text/plain')?{title:new URL(target).hostname,text:raw.slice(0,60000),truncated:raw.length>60000}:extractOfficialText(raw);
  if(extracted.text.length<80)throw Error('SOURCE_EMPTY');
  return {...extracted,url:target,retrievedAt:new Date().toISOString(),sha256:createHash('sha256').update(extracted.text).digest('hex')};
 }
 throw Error('SOURCE_REDIRECT');
}
