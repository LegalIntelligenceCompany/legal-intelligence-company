import { safeSourceUrl } from './legal-research';
import { readClause } from './clauses';
export type Dossier = { id:string; kind:'dossier'|'watch'|'clause'; title:string; description:string; created_at:string };
export type LibrarySource = {title:string;url:string;excerpt?:string;reference?:string;version?:string;consulted?:string;reviewed?:boolean};
export type LibraryEntry = { id:string; dossier_id:string; title:string; body:string; sources:LibrarySource[]; created_at:string };
export function libraryId(value: unknown): value is string { return typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
export function libraryText(value:unknown, max:number, empty=false) { if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())) throw new Error('INVALID'); return value.trim(); }
export function librarySources(value:unknown) {
 if(!Array.isArray(value)||value.length>100) throw new Error('INVALID');
 const result=value.map(s=>{if(!s||typeof s!=='object') throw new Error('INVALID'); const url=safeSourceUrl(s.url); if(!url||url.length>2000) throw new Error('INVALID'); const source:LibrarySource={title:libraryText(s.title,250),url};
 for(const [key,max] of [['excerpt',4000],['reference',500],['version',500],['consulted',10]] as const)if(s[key]!==undefined)source[key]=libraryText(s[key],max,true);
 if(source.consulted&&(!/^\d{4}-\d{2}-\d{2}$/.test(source.consulted)||!Number.isFinite(Date.parse(source.consulted))||new Date(source.consulted).toISOString().slice(0,10)!==source.consulted))throw new Error('INVALID');
 if(s.reviewed!==undefined){if(typeof s.reviewed!=='boolean')throw new Error('INVALID');source.reviewed=s.reviewed;if(s.reviewed&&(!source.excerpt||!source.reference||!source.version||!source.consulted))throw new Error('INVALID');}
 return source;});
 if(new TextEncoder().encode(JSON.stringify(result)).length>59000)throw new Error('INVALID');return result;
}
export function sourceEvidence(s:LibrarySource){return `${s.title}: ${s.url}\nReferência: ${s.reference||'não indicada'}\nVersão / vigência declarada: ${s.version||'não confirmada'}\nConsultada em: ${s.consulted||'não indicado'}\nExcerto: ${s.excerpt||'não indicado'}\n${s.reviewed?'Conferida pelo utilizador; não é certificação jurídica.':'Por conferir.'}`;}
export function exportDossier(dossier:Dossier, entries:LibraryEntry[]) {
 return `LIC — ${dossier.title}\n${dossier.description}\nExportado: ${new Date().toISOString()}\nConteúdo guardado pelo utilizador; não constitui verificação jurídica.\n\n`+entries.map(e=>{const c=readClause(e.body);const text=dossier.kind==='clause'?`${c.approved?'Aprovada pelo utilizador':'Rascunho — não aprovada'}\nContexto: ${c.usage||'Não indicado'}\n\n${c.text}`:e.body;return `${e.title}\nGuardado: ${e.created_at}\n${text}\nFontes:\n${e.sources.map(sourceEvidence).join('\n\n')}`;}).join('\n\n---\n\n');
}
export function compareReports(before:string, after:string) {
 // Textual changes are NOT proof of a legislative amendment.
 const lines=(s:string)=>s.split('\n').map(l=>l.trim()).filter(Boolean);
 const a=new Set(lines(before)), b=new Set(lines(after));
 return {removed:[...a].filter(l=>!b.has(l)),added:[...b].filter(l=>!a.has(l))};
}
