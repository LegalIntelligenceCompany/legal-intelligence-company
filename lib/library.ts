import { safeSourceUrl } from './legal-research';
import { readClause } from './clauses';
export type Dossier = { id:string; kind:'dossier'|'watch'|'clause'; title:string; description:string; created_at:string };
export type LibraryEntry = { id:string; dossier_id:string; title:string; body:string; sources:{title:string;url:string}[]; created_at:string };
export function libraryId(value: unknown): value is string { return typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
export function libraryText(value:unknown, max:number, empty=false) { if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())) throw new Error('INVALID'); return value.trim(); }
export function librarySources(value:unknown) {
 if(!Array.isArray(value)||value.length>100) throw new Error('INVALID');
 return value.map(s=>{if(!s||typeof s!=='object') throw new Error('INVALID'); const url=safeSourceUrl(s.url); if(!url||url.length>2000) throw new Error('INVALID'); return {title:libraryText(s.title,250),url};});
}
export function exportDossier(dossier:Dossier, entries:LibraryEntry[]) {
 return `LIC — ${dossier.title}\n${dossier.description}\nExportado: ${new Date().toISOString()}\nConteúdo guardado pelo utilizador; não constitui verificação jurídica.\n\n`+entries.map(e=>{const c=readClause(e.body);const text=dossier.kind==='clause'?`${c.approved?'Aprovada pelo utilizador':'Rascunho — não aprovada'}\nContexto: ${c.usage||'Não indicado'}\n\n${c.text}`:e.body;return `${e.title}\nGuardado: ${e.created_at}\n${text}\nFontes:\n${e.sources.map(s=>`${s.title}: ${s.url}`).join('\n')}`;}).join('\n\n---\n\n');
}
export function compareReports(before:string, after:string) {
 // Textual changes are NOT proof of a legislative amendment.
 const lines=(s:string)=>s.split('\n').map(l=>l.trim()).filter(Boolean);
 const a=new Set(lines(before)), b=new Set(lines(after));
 return {removed:[...a].filter(l=>!b.has(l)),added:[...b].filter(l=>!a.has(l))};
}
