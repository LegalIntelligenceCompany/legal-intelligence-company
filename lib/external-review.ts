import 'server-only';
import type {Reviewer} from './reviewer-catalogue';
import {reviewerKey} from './reviewer-catalogue';
// Text-only, no tools, no cache writes, no automatic retry or provider fallback.
type Raw=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const count=(v:unknown)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw Error('METER_UNCONFIRMED');return v;};
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
export async function externalReview(reviewer:Reviewer,instructions:string,prompt:string,schema:unknown,maxInput:number,maxOutput:number){
 const key=process.env[reviewerKey(reviewer.provider)];if(!key)throw Error('MODEL_UNAVAILABLE');
 // Count actual text using the selected provider before sending a paid request.
 const anthropic=reviewer.provider==='anthropic';
 const headers:Record<string,string>={'Content-Type':'application/json',...(anthropic?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{'x-goog-api-key':key})};
 const base=anthropic?'https://api.anthropic.com/v1/messages':'https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(reviewer.model);
 const system=instructions+'\nDevolve apenas JSON válido conforme este esquema: '+JSON.stringify(schema);
 const content=anthropic?{model:reviewer.model,system,messages:[{role:'user',content:prompt}]}:{systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}]};
 const counted=await fetch(anthropic?base+'/count_tokens':base+':countTokens',{method:'POST',headers,body:JSON.stringify(anthropic?content:{generateContentRequest:{...content,model:'models/'+reviewer.model}}),redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!counted.ok)throw Error('MODEL_UNAVAILABLE');const tokens=await counted.json();
 if(count(anthropic?tokens.input_tokens:tokens.totalTokens)>maxInput)throw Error('METER_CEILING');
 const body=anthropic?{...content,max_tokens:maxOutput,stream:false,service_tier:'standard_only'}:{...content,generationConfig:{maxOutputTokens:maxOutput,candidateCount:1,responseMimeType:'application/json'}};
 const response=await fetch(anthropic?base:base+':generateContent',{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('PROVIDER');
 return normaliseExternalReview(reviewer.provider,reviewer.model,await response.json());
}
