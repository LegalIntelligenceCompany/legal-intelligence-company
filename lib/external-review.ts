import 'server-only';
import type {Reviewer} from './reviewer-catalogue';
import {reviewerKey} from './reviewer-catalogue';
// Text-only, no tools, no cache writes, no automatic retry or provider fallback.
type Raw=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const count=(v:unknown)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw Error('METER_UNCONFIRMED');return v;};
const countReasons={
 key:'Chave do fornecedor em falta.',
 authentication:'O fornecedor rejeitou a autenticação. Verifique a chave.',
 permission:'O fornecedor recusou acesso a esta operação.',
 billing:'O fornecedor indicou saldo insuficiente na conta API.',
 model:'O fornecedor não encontrou o modelo ou a operação.',
 rate:'O fornecedor indicou limite de pedidos. Não houve repetição automática.',
 request:'O fornecedor rejeitou o formato ou os parâmetros da contagem.',
 unavailable:'O fornecedor está indisponível para a contagem.',
 timeout:'A contagem excedeu o tempo de espera.',
 network:'Não foi possível concluir a ligação para contar tokens.',
 response:'A contagem devolveu uma resposta inválida ou incompleta.',
 ceiling:'A contagem ultrapassou o limite de entrada autorizado.',
};
class CountFailure extends Error{
 constructor(readonly reason:keyof typeof countReasons,readonly status?:number){super(reason==='ceiling'?'METER_CEILING':'COUNT_FAILED');}
}
export function countFailureMessage(error:unknown):string|null{
 if(!(error instanceof CountFailure))return null;
 return `Etapa: contagem de tokens${error.status?` (HTTP ${error.status})`:''}. ${countReasons[error.reason]} Não foi enviado um pedido de geração.`;
}
export async function checkExternalModel(reviewer:Reviewer){
 const key=process.env[reviewerKey(reviewer.provider)];if(!key)throw Error('MODEL_UNAVAILABLE');
 const anthropic=reviewer.provider==='anthropic';
 const url=anthropic?'https://api.anthropic.com/v1/models/':'https://generativelanguage.googleapis.com/v1beta/models/';
 const headers:Record<string,string>=anthropic?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{'x-goog-api-key':key};
 const response=await fetch(url+encodeURIComponent(reviewer.model),{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('MODEL_UNAVAILABLE');const raw=await response.json();
 if(anthropic?raw.id!==reviewer.model:raw.name!=='models/'+reviewer.model||!raw.supportedGenerationMethods?.includes('generateContent'))throw Error('MODEL_UNAVAILABLE');
}
export function normaliseExternalReview(provider:Reviewer['provider'],model:string,raw:Raw){
 let input:number,cached:number,output:number,reasoning=0,text:string,id:string,completed:boolean;
 if(provider==='anthropic'){
  if(raw.model!==model||typeof raw.id!=='string'||!/^msg_[A-Za-z0-9_-]+$/.test(raw.id))throw Error('METER_UNCONFIRMED');
  const u=raw.usage;if(!u||count(u.cache_creation_input_tokens??0)!==0||
   Object.values(u.server_tool_use||{}).some(v=>count(v)!==0)||
   (u.service_tier&&u.service_tier!=='standard')||(u.inference_geo&&u.inference_geo!=='global'))throw Error('METER_UNCONFIRMED');
  cached=count(u.cache_read_input_tokens??0);input=count(u.input_tokens)+cached;output=count(u.output_tokens);
  if(!Array.isArray(raw.content)||raw.content.some((b:Raw)=>!['text','thinking','redacted_thinking'].includes(b.type)))throw Error('METER_UNCONFIRMED');
  text=raw.content.filter((b:Raw)=>b.type==='text').map((b:Raw)=>b.text).join('\n');
  id='resp_anthropic_'+raw.id;completed=raw.stop_reason==='end_turn';
 }else{
  if(raw.modelVersion!==model||typeof raw.responseId!=='string'||!/^[-A-Za-z0-9_]+$/.test(raw.responseId))throw Error('METER_UNCONFIRMED');
  const u=raw.usageMetadata;if(!u||count(u.toolUsePromptTokenCount??0)!==0)throw Error('METER_UNCONFIRMED');
  for(const field of ['promptTokensDetails','cacheTokensDetails','candidatesTokensDetails']){
   if(u[field]&&(!Array.isArray(u[field])||u[field].some((d:Raw)=>d.modality!=='TEXT')))throw Error('METER_UNCONFIRMED');
  }
  input=count(u.promptTokenCount);cached=count(u.cachedContentTokenCount??0);reasoning=count(u.thoughtsTokenCount??0);output=count(u.candidatesTokenCount)+reasoning;
  if(count(u.totalTokenCount)!==input+output||!Array.isArray(raw.candidates)||raw.candidates.length!==1)throw Error('METER_UNCONFIRMED');
  const candidate=raw.candidates[0];const parts=candidate.content?.parts;
  if(!Array.isArray(parts)||parts.some((p:Raw)=>typeof p.text!=='string')||candidate.groundingMetadata)throw Error('METER_UNCONFIRMED');
  text=parts.filter((p:Raw)=>!p.thought).map((p:Raw)=>p.text).join('\n');
  id='resp_google_'+raw.responseId;completed=candidate.finishReason==='STOP';
 }
 if(cached>input||!Number.isSafeInteger(input+output)||typeof text!=='string'||text.length>100000)throw Error('METER_UNCONFIRMED');
 return {id,model,service_tier:'default',status:completed?'completed':'incomplete',
  usage:{input_tokens:input,input_tokens_details:{cached_tokens:cached},output_tokens:output,output_tokens_details:{reasoning_tokens:reasoning},total_tokens:input+output},
  output:[{type:'message',role:'assistant',content:[{type:'output_text',text,annotations:[]}]}]};
}
async function prepareCount(reviewer:Reviewer,instructions:string,prompt:string,schema:unknown,maxInput:number){
 const key=process.env[reviewerKey(reviewer.provider)];if(!key)throw new CountFailure('key');
 // Count actual text using the selected provider before sending a paid request.
 const anthropic=reviewer.provider==='anthropic';
 const headers:Record<string,string>={'Content-Type':'application/json',...(anthropic?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{'x-goog-api-key':key})};
 const base=anthropic?'https://api.anthropic.com/v1/messages':'https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(reviewer.model);
 const system=instructions+'\nDevolve apenas JSON válido conforme este esquema: '+JSON.stringify(schema);
 const content=anthropic?{model:reviewer.model,system,messages:[{role:'user',content:prompt}]}:{systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}]};
 let counted:Response;
 try{counted=await fetch(anthropic?base+'/count_tokens':base+':countTokens',{method:'POST',headers,body:JSON.stringify(anthropic?content:{generateContentRequest:{...content,model:'models/'+reviewer.model}}),redirect:'error',signal:AbortSignal.timeout(5000)});}
 catch(error){throw new CountFailure(error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)?'timeout':'network');}
 if(!counted.ok){
  let billing=false;
  // Never expose provider messages, headers, prompts or credentials to the client.
  try{const body=await counted.json();billing=anthropic&&counted.status===400&&body?.error?.type==='invalid_request_error'&&typeof body.error.message==='string'&&/credit balance is too low|insufficient credits/i.test(body.error.message);}catch{/* Generic HTTP classification only. */}
  const reason=billing?'billing':counted.status===401?'authentication':counted.status===403?'permission':counted.status===404?'model':counted.status===429?'rate':counted.status>=500?'unavailable':'request';
  throw new CountFailure(reason,counted.status);
 }
 let inputTokens:number;
 try{const tokens=await counted.json();inputTokens=count(anthropic?tokens.input_tokens:tokens.totalTokens);}catch{throw new CountFailure('response',counted.status);}
 if(inputTokens>maxInput)throw new CountFailure('ceiling');
 return {anthropic,base,headers,content,inputTokens};
}
// Count-only path cannot reach a generation endpoint or a budget mutation.
export async function countExternalReview(reviewer:Reviewer,instructions:string,prompt:string,schema:unknown,maxInput:number){
 return (await prepareCount(reviewer,instructions,prompt,schema,maxInput)).inputTokens;
}
export async function externalReview(reviewer:Reviewer,instructions:string,prompt:string,schema:unknown,maxInput:number,maxOutput:number){
 const {anthropic,base,headers,content}=await prepareCount(reviewer,instructions,prompt,schema,maxInput);
 const body=anthropic?{...content,max_tokens:maxOutput,stream:false,service_tier:'standard_only'}:{...content,generationConfig:{maxOutputTokens:maxOutput,candidateCount:1,responseMimeType:'application/json'}};
 const response=await fetch(anthropic?base:base+':generateContent',{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('PROVIDER');
 return normaliseExternalReview(reviewer.provider,reviewer.model,await response.json());
}
