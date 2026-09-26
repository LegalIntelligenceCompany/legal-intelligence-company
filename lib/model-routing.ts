// Owner-approved measurements, not provider marketing or a model's self-rating.
export type ModelMeasurement={model:string;task:'research';dataset:string;evaluatedAt:string;expiresAt:string;cases:number;humanReviewed:number;score:number;criticalFailures:number;p95Seconds:number;approved:boolean};
export function measuredResearchModel(raw:string|undefined,now=Date.now()):string|null{
 if(!raw||raw.length>20000)return null;
 try{const rows=JSON.parse(raw);if(!Array.isArray(rows)||rows.length>30)return null;
  const eligible=rows.filter((r:ModelMeasurement)=>r&&r.approved===true&&r.task==='research'&&['gpt-5-mini','gpt-6-astra'].includes(r.model)&&typeof r.dataset==='string'&&r.dataset.length>3&&Number.isFinite(Date.parse(r.evaluatedAt))&&Date.parse(r.evaluatedAt)<=now&&now-Date.parse(r.evaluatedAt)<=30*86400000&&Date.parse(r.expiresAt)>now&&Date.parse(r.expiresAt)-Date.parse(r.evaluatedAt)<=30*86400000&&Number.isInteger(r.cases)&&r.cases>=20&&Number.isInteger(r.humanReviewed)&&r.humanReviewed===r.cases&&Number.isFinite(r.score)&&r.score>=90&&r.score<=100&&r.criticalFailures===0&&Number.isFinite(r.p95Seconds)&&r.p95Seconds>0);
  eligible.sort((a:ModelMeasurement,b:ModelMeasurement)=>b.score-a.score||a.p95Seconds-b.p95Seconds||a.model.localeCompare(b.model));return eligible[0]?.model??null;
 }catch{return null;}
}
