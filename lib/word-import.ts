import {crc32,wordZip} from './word-review';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const decoder=new TextDecoder('utf-8',{fatal:true});
const MAX=10*1024*1024;
function invalid():never{throw Error('DOCX inválido, protegido ou não suportado. Use um ficheiro .docx simples, sem macros ou ligações externas.');}
export async function readWordZip(input:Uint8Array):Promise<Record<string,Uint8Array>>{
 if(input.length<22||input.length>5*1024*1024)throw Error('O DOCX deve ter até 5 MB.');
 const view=new DataView(input.buffer,input.byteOffset,input.byteLength);let end=-1;
 for(let p=input.length-22;p>=Math.max(0,input.length-65557);p--)if(view.getUint32(p,true)===0x06054b50&&p+22+view.getUint16(p+20,true)===input.length){end=p;break;}
 if(end<0||view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)invalid();
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
 if(!count||count>256||view.getUint16(end+8,true)!==count||start+size!==end)invalid();
 const files:Record<string,Uint8Array>=Object.create(null);let p=start,total=0;
 for(let i=0;i<count;i++){
  if(p+46>end||view.getUint32(p,true)!==0x02014b50)invalid();
  const flags=view.getUint16(p+8,true),method=view.getUint16(p+10,true),crc=view.getUint32(p+16,true),packed=view.getUint32(p+20,true),length=view.getUint32(p+24,true),nameLength=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),local=view.getUint32(p+42,true);
  if(flags&~0x808||![0,8].includes(method)||view.getUint16(p+34,true)!==0||p+46+nameLength+extra+comment>end||local+30>start)invalid();
  const name=decoder.decode(input.subarray(p+46,p+46+nameLength));
  if(!name||name.includes('..')||name.startsWith('/')||name.includes('\\')||/[\x00-\x1f]/.test(name)||Object.hasOwn(files,name)||/vba|embeddings|activeX|\.bin$/i.test(name))invalid();
  if(view.getUint32(local,true)!==0x04034b50||view.getUint16(local+6,true)!==flags||view.getUint16(local+8,true)!==method)invalid();
  const localNameLength=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true),dataStart=local+30+localNameLength+localExtra;
  if(dataStart+packed>start||decoder.decode(input.subarray(local+30,local+30+localNameLength))!==name)invalid();
  total+=length;if(length>MAX||total>MAX)throw Error('Conteúdo descomprimido demasiado grande (limite 10 MB).');
  let data:Uint8Array;
  if(method===0){if(packed!==length)invalid();data=input.slice(dataStart,dataStart+packed);}else{
   const stream=new Blob([new Uint8Array(input.subarray(dataStart,dataStart+packed))]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
   const reader=stream.getReader(),chunks:Uint8Array[]=[];let used=0;
   try{while(true){const next=await reader.read();if(next.done)break;used+=next.value.length;if(used>length||used>MAX){await reader.cancel();invalid();}chunks.push(next.value);}if(used!==length)invalid();data=new Uint8Array(used);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}}finally{reader.releaseLock();}
  }
  if(crc32(data)!==crc)invalid();files[name]=data;p+=46+nameLength+extra+comment;
 }
 if(p!==end||!files['word/document.xml']||!files['[Content_Types].xml'])invalid();return files;
}
function parse(bytes:Uint8Array){const text=decoder.decode(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))invalid();const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)invalid();return doc;}
function children(element:Element){return Array.from(element.children);}
function allowed(element:Element,names:string[]){return element.namespaceURI===W&&names.includes(element.localName);}
export type ImportedWord={files:Record<string,Uint8Array>;text:string};
export async function importWord(bytes:Uint8Array):Promise<ImportedWord>{
 const files=await readWordZip(bytes);
 for(const [name,data] of Object.entries(files))if(name.endsWith('.xml')||name.endsWith('.rels')){
  const doc=parse(data);
  if(name==='[Content_Types].xml'){
   const ns='http://schemas.openxmlformats.org/package/2006/content-types';
   if(doc.documentElement.namespaceURI!==ns||doc.documentElement.localName!=='Types'||/macroEnabled|oleObject|activeX/i.test(decoder.decode(data))||!Array.from(doc.getElementsByTagNameNS(ns,'Override')).some(e=>e.getAttribute('PartName')==='/word/document.xml'&&e.getAttribute('ContentType')==='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'))invalid();
  }
  if(name.endsWith('.rels')&&Array.from(doc.getElementsByTagNameNS('*','Relationship')).some(r=>r.getAttribute('TargetMode')==='External'||/oleObject|aFChunk|attachedTemplate/i.test(r.getAttribute('Type')||'')))invalid();
 }
 const doc=parse(files['word/document.xml']),bodies=doc.getElementsByTagNameNS(W,'body'),body=bodies[0];if(doc.documentElement.namespaceURI!==W||doc.documentElement.localName!=='document'||bodies.length!==1||body.parentNode!==doc.documentElement)invalid();
 if(children(body).some(e=>!allowed(e,['p','sectPr'])))throw Error('Este DOCX contém tabelas ou estruturas complexas. Não foi importado para evitar perder conteúdo.');
 const paragraphs=children(body).filter(e=>allowed(e,['p']));if(paragraphs.length>2000)invalid();
 const lines=paragraphs.map(p=>{
  if(children(p).some(e=>!allowed(e,['pPr','r'])))throw Error('O documento contém revisões, campos, ligações ou marcadores não suportados. Prepare uma cópia simples antes de importar.');
  // Reject existing revisions also inside paragraph/run formatting.
  if(Array.from(p.getElementsByTagNameNS(W,'*')).some(e=>['ins','del','moveFrom','moveTo','pPrChange','rPrChange'].includes(e.localName)))invalid();
  return children(p).filter(e=>allowed(e,['r'])).map(r=>{
   if(children(r).some(e=>!allowed(e,['rPr','t','tab'])))throw Error('O documento contém imagens, campos ou quebras internas não suportados.');
   return children(r).map(e=>e.localName==='t'?e.textContent||'':e.localName==='tab'?'\t':'').join('');
  }).join('');
 });
 const text=lines.join('\n');if(!text.trim()||text.length>60000)throw Error('O texto deve ter entre 1 e 60 000 caracteres.');return {files,text};
}
export function reviseImportedWord(source:ImportedWord,proposed:string,author:string):Uint8Array{
 if(!author.trim()||author.length>120||!proposed.trim()||proposed.length>60000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(proposed))throw Error('Verifique o texto e o nome do revisor.');
 const doc=parse(source.files['word/document.xml']),body=doc.getElementsByTagNameNS(W,'body')[0],paragraphs=children(body).filter(p=>allowed(p,['p']));
 const before=source.text.split('\n'),after=proposed.replace(/\r\n?/g,'\n').split('\n');
 if(after.length!==before.length)throw Error('Para preservar a formatação, mantenha o número de parágrafos. Pode mudar para exportação de texto simples para inserir ou eliminar parágrafos.');
 let id=0;const stamp=new Date().toISOString();
 paragraphs.forEach((p,i)=>{if(before[i]===after[i])return;const runs=children(p).filter(e=>allowed(e,['r']));const formatting=runs[0]?.getElementsByTagNameNS(W,'rPr')[0]?.cloneNode(true);
  function revision(kind:string){const e=doc.createElementNS(W,'w:'+kind);e.setAttributeNS(W,'w:id',String(id++));e.setAttributeNS(W,'w:author',author.trim());e.setAttributeNS(W,'w:date',stamp);return e;}
  const deleted=revision('del');for(const run of runs){for(const t of Array.from(run.getElementsByTagNameNS(W,'t'))){const d=doc.createElementNS(W,'w:delText');d.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');d.textContent=t.textContent;t.replaceWith(d);}deleted.appendChild(run);}p.appendChild(deleted);
  const inserted=revision('ins'),r=doc.createElementNS(W,'w:r');if(formatting)r.appendChild(formatting);after[i].split('\t').forEach((part,n)=>{if(n)r.appendChild(doc.createElementNS(W,'w:tab'));const t=doc.createElementNS(W,'w:t');t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');t.textContent=part;r.appendChild(t);});inserted.appendChild(r);p.appendChild(inserted);
 });
 return wordZip({...source.files,'word/document.xml':new XMLSerializer().serializeToString(doc)});
}
