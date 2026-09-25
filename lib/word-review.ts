// Minimal, dependency-free OOXML export. Plain text only: no uploaded document
// formatting, macros, external relationships or embedded objects are imported.
const encoder=new TextEncoder();
function xml(value:string){return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));}
export function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function concat(parts:Uint8Array[]){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;}
function header(size:number,fields:[number,number,number][]){const data=new Uint8Array(size);const view=new DataView(data.buffer);for(const [offset,width,value] of fields){if(width===4)view.setUint32(offset,value,true);else view.setUint16(offset,value,true);}return data;}
export function wordZip(files:Record<string,string|Uint8Array>){const locals:Uint8Array[]=[],directory:Uint8Array[]=[];let offset=0;for(const [name,text] of Object.entries(files)){const path=encoder.encode(name),data=typeof text==='string'?encoder.encode(text):text,crc=crc32(data);const local=header(30,[[0,4,0x04034b50],[4,2,20],[6,2,0x800],[12,2,33],[14,4,crc],[18,4,data.length],[22,4,data.length],[26,2,path.length]]);locals.push(local,path,data);directory.push(header(46,[[0,4,0x02014b50],[4,2,20],[6,2,20],[8,2,0x800],[14,2,33],[16,4,crc],[20,4,data.length],[24,4,data.length],[28,2,path.length],[42,4,offset]]),path);offset+=local.length+path.length+data.length;}
 const central=concat(directory);return concat([...locals,central,header(22,[[0,4,0x06054b50],[8,2,Object.keys(files).length],[10,2,Object.keys(files).length],[12,4,central.length],[16,4,offset]])]);}
export function trackedWord(original:string,proposed:string,author:string,date=new Date()){
 if(!original.trim()||!proposed.trim()||original.length>60000||proposed.length>60000||!author.trim()||author.length>120||!Number.isFinite(date.getTime()))throw Error('Preencha os dois textos (até 60 000 caracteres) e o nome do revisor.');
 const paragraphs=(s:string)=>s.replace(/\r\n?/g,'\n').split('\n');const a=paragraphs(original),b=paragraphs(proposed);if(a.length>2000||b.length>2000)throw Error('Limite de 2000 parágrafos por texto.');
 let id=0;const stamp=`w:author="${xml(author.trim())}" w:date="${date.toISOString()}"`;
 const run=(text:string,deleted=false)=>`<w:r><w:${deleted?'delText':'t'} xml:space="preserve">${xml(text)}</w:${deleted?'delText':'t'}></w:r>`;
 // Track paragraph marks as well as text: accepting all yields exactly the
 // proposal, rejecting all yields the original, including inserted/deleted lines.
 const change=(text:string,kind:'ins'|'del')=>`<w:p><w:pPr><w:rPr><w:${kind} w:id="${id++}" ${stamp}/></w:rPr></w:pPr><w:${kind} w:id="${id++}" ${stamp}>${run(text,kind==='del')}</w:${kind}></w:p>`;
 const body=Array.from({length:Math.max(a.length,b.length)},(_,i)=>a[i]===b[i]?`<w:p>${run(a[i])}</w:p>`:(a[i]!==undefined?change(a[i],'del'):'')+(b[i]!==undefined?change(b[i],'ins'):'')).join('');
 return wordZip({
 '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>',
 '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>',
 'word/settings.xml':'<?xml version="1.0" encoding="UTF-8"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:trackRevisions/></w:settings>',
 'word/document.xml':`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
 });
}

/** Editable report, without pretending to preserve an uploaded PDF's layout. */
export function reportWord(title:string,text:string){
 if(!title.trim()||title.length>200||!text.trim()||text.length>2000000)throw Error('Relatório fora dos limites.');
 const paragraph=(s:string,style='Normal')=>`<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${xml(s)}</w:t></w:r></w:p>`;
 return wordZip({
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'word/styles.xml':'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="280"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1E453B"/></w:rPr></w:style></w:styles>',
 'word/document.xml':`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(title,'Title')}${text.replace(/\r\n?/g,'\n').split('\n').map(s=>paragraph(s)).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`
 });
}
