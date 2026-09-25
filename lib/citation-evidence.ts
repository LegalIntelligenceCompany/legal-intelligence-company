import {safeSourceUrl} from './legal-research';
import type {AssistantResult,Citation} from './assistant';
const official=['diariodarepublica.pt','dre.pt','dgsi.pt','tribunalconstitucional.pt','stj.pt','tribunais.org.pt','eur-lex.europa.eu','curia.europa.eu'];
export function officialSource(url:string){try{const host=new URL(url).hostname.toLowerCase();return official.some(d=>host===d||host.endsWith('.'+d));}catch{return false;}}
/** A citation is evidence of attribution, not independent factual verification. */
export function citationEvidence(result:AssistantResult){
 const valid:Citation[]=[];
 for(const c of [...result.citations].sort((a,b)=>a.start-b.start)){
  const url=safeSourceUrl(c.url);
  if(!url||!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<0||c.end<=c.start||c.end>result.text.length||c.start<(valid.at(-1)?.end??0))continue;
  valid.push({...c,url});
 }
 const urls=[...new Set(valid.map(c=>c.url))];
 return valid.map(c=>{
  const from=result.text.lastIndexOf('\n\n',c.start),to=result.text.indexOf('\n\n',c.end);
  const context=result.text.slice(from<0?0:from+2,to<0?result.text.length:to).trim();
  return {...c,number:urls.indexOf(c.url)+1,official:officialSource(c.url),context:context.length>1600?context.slice(Math.max(0,c.start-(from<0?0:from+2)-1000),Math.max(0,c.start-(from<0?0:from+2)-1000)+1600):context};
 });
}
export function isCitationMarker(text:string){return /^(?:\[\d+(?:\s*[,;]\s*\d+)*\]|[\uE200-\uF8FF][^\n]*[\uE200-\uF8FF])$/.test(text.trim());}
export function attributedText(result:AssistantResult){
 const evidence=citationEvidence(result);let text='',last=0;
 for(const citation of evidence){const span=result.text.slice(citation.start,citation.end);text+=result.text.slice(last,citation.start)+(isCitationMarker(span)?'':span+' ')+`[${citation.number}]`;last=citation.end;}
 text+=result.text.slice(last);
 const sources=[...new Map(evidence.map(c=>[c.url,c])).values()].map(c=>`[${c.number}] ${c.title}: ${c.url}`).join('\n');
 return text+'\n\nFontes atribuídas (suporte e vigência por conferir):\n'+(sources||'Sem ligações verificáveis nesta resposta.');
}
