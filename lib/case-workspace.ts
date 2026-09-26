export const recordKinds={source:'Fonte / versão jurídica',fact:'Facto / cronologia',person:'Interveniente',evidence:'Prova',task:'Tarefa',contradiction:'Contradição',document:'Texto documental'} as const;
export type CaseRecord={type:'lic-case-v1';kind:keyof typeof recordKinds;text:string;date:string;until:string;reference:string;url:string;related:string[];status:'pending'|'reviewed'|'done';jurisdiction:string};
export const blankRecord=():CaseRecord=>({type:'lic-case-v1',kind:'fact',text:'',date:'',until:'',reference:'',url:'',related:[],status:'pending',jurisdiction:'PT'});
export function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
export function readCaseRecord(body:string):CaseRecord|null{
 try{const r=JSON.parse(body);if(r?.type!=='lic-case-v1'||!Object.hasOwn(recordKinds,r.kind)||!['pending','reviewed','done'].includes(r.status))return null;
  for(const [k,max] of [['text',60000],['reference',500],['url',2000],['jurisdiction',80],['date',10],['until',10]] as const)if(typeof r[k]!=='string'||r[k].length>max)return null;
  if(!r.text.trim()||r.date&&!validDate(r.date)||r.until&&!validDate(r.until)||r.date&&r.until&&r.until<r.date)return null;
  if(r.url){const u=new URL(r.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;}
  if(!Array.isArray(r.related)||r.related.length>30||r.related.some((s:unknown)=>typeof s!=='string'||!/^[-a-f0-9]{36}$/i.test(s)))return null;
  return r;
 }catch{return null;}
}
export function temporalStatus(r:CaseRecord,date:string){
 if(r.kind!=='source'||!validDate(date)||!r.date)return 'unconfirmed';
 if(date<r.date||r.until&&date>r.until)return 'outside';
 return r.status==='reviewed'?'declared-in-range':'unconfirmed';
}
// Exact normalized quotation occurrence, NOT semantic entailment or legal validity.
export function locateQuote(text:string,quote:string){
 const normal=(s:string)=>s.normalize('NFC').replace(/\s+/g,' ').trim();
 const hay=normal(text),needle=normal(quote);if(needle.length<12||needle.length>4000)return null;
 const start=hay.indexOf(needle);if(start<0)return null;
 return {start,end:start+needle.length,context:hay.slice(Math.max(0,start-180),Math.min(hay.length,start+needle.length+180)),multiple:hay.indexOf(needle,start+needle.length)>=0};
}
export function currentRecords<T extends {id:string;body:string;revision_of?:string|null}>(entries:T[]){
 const superseded=new Set(entries.map(e=>e.revision_of).filter(Boolean));
 return entries.filter(e=>!superseded.has(e.id)).flatMap(e=>{const record=readCaseRecord(e.body);return record?[{...e,record}]:[];});
}
export function potentialContradictions(records:{id:string;record:CaseRecord}[]){
 const keyed=new Map<string,{id:string;record:CaseRecord}[]>();
 for(const r of records){if(!r.record.reference.trim()||!['fact','source'].includes(r.record.kind))continue;const key=[r.record.kind,r.record.jurisdiction,r.record.reference.toLocaleLowerCase('pt-PT'),r.record.date].join('|');keyed.set(key,[...(keyed.get(key)??[]),r]);}
 return [...keyed.values()].filter(group=>group.length>1&&new Set(group.map(r=>r.record.text.trim())).size>1);
}
