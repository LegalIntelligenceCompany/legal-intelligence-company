import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { libraryId, librarySources, libraryText } from '@/lib/library';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
function fail(error:unknown) { const code=error instanceof Error?error.message:'PROVIDER'; const messages:Record<string,string>={UNAUTHORIZED:'Entre na sua conta.',FORBIDDEN:'Sem acesso a este registo.',INVALID:'Verifique os campos e limites.',SETUP:'Execute o SQL em Configurar armazenamento (007, 008 e 019).',SHARE_LIMIT:'Limite de 100 acessos por dossier atingido.',LIBRARY_LIMIT:'Limite de 100 dossiês/temas ou 1000 registos atingido. Exporte e elimine o que já não precisa.'}; return NextResponse.json({error:messages[code]||'Não foi possível guardar ou ler os dados. Tente novamente.',code:messages[code]?code:'PROVIDER'},{status:code==='UNAUTHORIZED'?401:code==='FORBIDDEN'?403:code==='INVALID'?400:code==='LIBRARY_LIMIT'?409:503,headers}); }
function check(error:{code?:string;message?:string}|null) { if(!error)return; if(error.message?.includes('FORBIDDEN'))throw new Error('FORBIDDEN'); if(error.message?.includes('SHARE_LIMIT'))throw new Error('SHARE_LIMIT'); if(error.message?.includes('LIBRARY_LIMIT'))throw new Error('LIBRARY_LIMIT'); if(error.code==='23514'&&error.message?.includes('research_dossiers_kind_check'))throw new Error('SETUP'); if(['42P01','PGRST205','PGRST202','PGRST204','42703','42883'].includes(error.code||''))throw new Error('SETUP'); throw new Error('PROVIDER'); }
async function auth() { const client=await createClient(true); if(!client)throw new Error('SETUP');const {data,error}=await client.auth.getUser();if(error||!data.user)throw new Error('UNAUTHORIZED');return {client,user:data.user}; }
async function body(request:Request) { const reader=request.body?.getReader();if(!reader)throw new Error('INVALID');const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>350000){await reader.cancel();throw new Error('INVALID');}chunks.push(value);}const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('INVALID');return v;}catch{throw new Error('INVALID');}finally{reader.releaseLock();} }
export async function GET(request:Request) { try {
 const {client,user}=await auth();const params=new URL(request.url).searchParams;const id=params.get('id'),access=params.get('access');
 if((id&&!libraryId(id))||(access&&!libraryId(access)))throw new Error('INVALID');
 if(access){
  const state=await client.rpc('research_access_state',{p_dossier:access});check(state.error);
  const teams=await client.rpc('team_state');check(teams.error);
  return NextResponse.json({grants:state.data,teams:teams.data,userId:user.id},{headers});
 }
 const dossiers=await client.from('research_dossiers').select('id,owner_id,kind,title,description,created_at').order('created_at',{ascending:false}).limit(1000);check(dossiers.error);
 const editable=await client.rpc('research_editable_dossiers');check(editable.error);
 let entries:unknown[]=[];
 if(id){
  // RLS, not a list limit, is the authority for access to a selected dossier.
  const accessible=await client.from('research_dossiers').select('id').eq('id',id).maybeSingle();check(accessible.error);if(!accessible.data)throw new Error('FORBIDDEN');
  const result=await client.from('research_entries').select('id,dossier_id,title,body,sources,created_at,created_by,revision_of').eq('dossier_id',id).order('created_at',{ascending:false}).order('id').limit(1000);check(result.error);
  entries=(result.data||[]).map(entry=>({...entry,sources:Array.isArray(entry.sources)?entry.sources.flatMap((source:unknown)=>{try{return librarySources([source]);}catch{return [];}}):[]}));
 }
 return NextResponse.json({dossiers:(dossiers.data||[]).map(({owner_id,...d})=>({...d,canEdit:owner_id===user.id||(editable.data||[]).includes(d.id),canManage:owner_id===user.id})),entries},{headers});
 }catch(e){return fail(e);} }
export async function POST(request:Request) { try {
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new Error('FORBIDDEN');
 const {client,user}=await auth();const v=await body(request);
 if(v.action==='create') { if(!['dossier','watch','clause'].includes(v.kind)||!libraryId(v.id))throw new Error('INVALID');const row={id:v.id,owner_id:user.id,kind:v.kind,title:libraryText(v.title,160),description:libraryText(v.description,4000,true)};const r=await client.from('research_dossiers').insert(row).select('id').single();check(r.error);return NextResponse.json({id:r.data!.id},{headers}); }
 if(!libraryId(v.dossierId))throw new Error('INVALID');
 if(v.action==='save') {if(!libraryId(v.id)||(v.revisionOf!=null&&!libraryId(v.revisionOf)))throw new Error('INVALID');const r=await client.rpc('research_append',{p_dossier:v.dossierId,p_id:v.id,p_title:libraryText(v.title,160),p_body:libraryText(v.body,80000),p_sources:librarySources(v.sources),p_revision:v.revisionOf??null});check(r.error);return NextResponse.json({saved:true},{headers});}
 const owner=await client.from('research_dossiers').select('id').eq('id',v.dossierId).eq('owner_id',user.id).maybeSingle();check(owner.error);if(!owner.data)throw new Error('FORBIDDEN');
 if(v.action==='share') {if(!libraryId(v.organizationId)||!libraryId(v.memberId)||typeof v.allow!=='boolean'||!['viewer','editor'].includes(v.role))throw new Error('INVALID');const r=await client.rpc('research_share',{p_dossier:v.dossierId,p_org:v.organizationId,p_member:v.memberId,p_allow:v.allow,p_role:v.role});check(r.error);}
  else if(v.action==='rename') {const r=await client.from('research_dossiers').update({title:libraryText(v.title,160),description:libraryText(v.description,4000,true)}).eq('id',v.dossierId).eq('owner_id',user.id);check(r.error);}
 else if(v.action==='delete-entry') {if(!libraryId(v.id))throw new Error('INVALID');const r=await client.from('research_entries').delete().eq('id',v.id).eq('dossier_id',v.dossierId).eq('owner_id',user.id);check(r.error);}
 else if(v.action==='delete') {const r=await client.from('research_dossiers').delete().eq('id',v.dossierId).eq('owner_id',user.id);check(r.error);}
 else throw new Error('INVALID');
 return NextResponse.json({saved:true},{headers});
 }catch(e){return fail(e);} }
