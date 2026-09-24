// Server-owned opt-in catalogue. Discovery alone must never authorise spending.
export type Reviewer={id:string;label:string;provider:'anthropic'|'google';model:string;validated:boolean};
export const suggestedReviewers:Reviewer[]=[
 {id:'review-sonnet',label:'Claude Sonnet · resposta e revisão',provider:'anthropic',model:'claude-sonnet-5',validated:false},
 {id:'review-opus',label:'Claude Opus · resposta e revisão',provider:'anthropic',model:'claude-opus-5-5',validated:false},
 {id:'review-haiku',label:'Claude Haiku · resposta e revisão',provider:'anthropic',model:'claude-haiku-4-5-20251001',validated:false},
 {id:'review-fable',label:'Claude Fable · resposta e revisão',provider:'anthropic',model:'claude-fable-5-1',validated:false},
 {id:'review-gemini',label:'Gemini Flash · resposta e revisão',provider:'google',model:'gemini-3.8-flash',validated:false},
];
export function reviewerCatalogue(env:Record<string,string|undefined>=process.env):Reviewer[]{
 try{
  const rows=JSON.parse(env.AI_REVIEW_MODELS_JSON||JSON.stringify(suggestedReviewers));
  if(!Array.isArray(rows)||rows.length>100)throw Error();
  const ids=new Set<string>();
  return rows.map((row:Reviewer)=>{
   if(!row||!/^review-[a-z0-9-]{1,64}$/.test(row.id)||ids.has(row.id)||
    typeof row.label!=='string'||!row.label.trim()||row.label.length>100||
    !['anthropic','google'].includes(row.provider)||typeof row.model!=='string'||
    !(row.provider==='anthropic'?/^claude-[a-z0-9.-]{1,100}$/:/^gemini-[a-z0-9.-]{1,100}$/).test(row.model))throw Error();
   ids.add(row.id);return {id:row.id,label:row.label,provider:row.provider,model:row.model,validated:row.validated===true};
  });
 }catch{throw Error('MODEL_CONFIGURATION');}
}
export function reviewerKey(provider:Reviewer['provider']){return provider==='anthropic'?'ANTHROPIC_API_KEY':'GEMINI_API_KEY';}
export function configuredReviewer(id:string):Reviewer{
 if(process.env.AI_EXTERNAL_MODELS_ENABLED!=='true')throw Error('MODEL_UNAVAILABLE');
 const model=reviewerCatalogue().find(row=>row.id===id);
 if(!model?.validated||!process.env[reviewerKey(model.provider)])throw Error('MODEL_UNAVAILABLE');
 return model;
}
