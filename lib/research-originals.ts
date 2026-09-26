import type {AssistantResult,OriginalEvidence} from './assistant';
import {fetchOfficialSource,permittedOfficialUrl} from './source-fetch';

/** Read only public, allowlisted citations. No queries, user material or credentials. */
export async function collectOriginals(draft:AssistantResult,reader=fetchOfficialSource):Promise<OriginalEvidence[]>{
 const sources=[...new Map(draft.citations.map(c=>[c.url,c])).values()].map((c,i)=>({...c,sourceId:i+1}));
 const candidates=sources.filter(c=>{try{permittedOfficialUrl(c.url);return true;}catch{return false;}}).slice(0,3);
 const results=await Promise.all(candidates.map(async c=>{
  try{
   const page=await reader(c.url);
   // Retain a bounded original excerpt, never present it as the complete source.
   const text=page.text.slice(0,4000);
   return {sourceId:c.sourceId,url:c.url,title:c.title,text,retrievedAt:page.retrievedAt,sha256:page.sha256,truncated:page.truncated||page.text.length>text.length};
  }catch{return null;}
 }));
 return results.filter((r):r is OriginalEvidence=>r!==null);
}
