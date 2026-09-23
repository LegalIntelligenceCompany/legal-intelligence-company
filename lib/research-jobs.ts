import {assistantInstructions,parseAssistantResponse,type AssistantInput,type AssistantResult} from './assistant';
export type ResearchJob={id:string;owner_id:string;input:AssistantInput;model:string;state:string;funding_mode?:'pilot'|'commercial';response_id?:string;result?:AssistantResult;error?:string;updated_at:string;expires_at:string};
export const researchErrors:Record<string,string>={
 SETUP:'Falta activar a pesquisa recuperável em /setup/research. Não foi iniciada uma chamada paga.',
 PAUSED:'A execução de IA está pausada. O pedido existente não é repetido.',
 FORBIDDEN:'Esta pesquisa não está disponível para esta conta.',
 INVALID_REQUEST:'Pedido inválido. A pesquisa recuperável aceita apenas perguntas públicas, sem documentos.',
 BUSY:'Já existe uma pesquisa em curso. Use Recuperar pesquisa.',
 UNKNOWN:'Não foi possível confirmar o início da etapa. Por segurança não a repetimos. A reserva mantém-se.',
 EXPIRED:'A janela de recuperação terminou. Não repetimos chamadas nem libertamos a reserva automaticamente.',
 NO_SOURCES:'Não foi possível obter uma resposta com fontes utilizáveis. Não apresentamos o rascunho.',
 INCOMPLETE:'A IA não produziu uma resposta completa. Não apresentamos o rascunho.',
 PROVIDER:'A etapa falhou no fornecedor. Não foi repetida automaticamente; a reserva mantém-se.',
 TIMEOUT:'O fornecedor não confirmou a operação dentro do limite. Não repetimos a chamada paga.',
 MODEL:'Modelo não autorizado. Escolha um dos motores disponíveis.',
 MODEL_UNAVAILABLE:'O modelo avançado não está disponível nesta conta API. Não foi reservado orçamento nem iniciada pesquisa.',
};
export function publicJob(job:ResearchJob){return {id:job.id,question:job.input.question,state:job.state,model:job.model,result:job.state==='completed'?job.result:undefined,error:job.error?researchErrors[job.error]||job.error:undefined};}
export function researchBody(input:AssistantInput,model:string,draft?:AssistantResult){
 return {model,background:true,store:false,service_tier:'default',max_output_tokens:12000,reasoning:{effort:'high'},
  tools:[{type:'web_search',search_context_size:'high'}],tool_choice:'required',max_tool_calls:2,
  instructions:assistantInstructions(input)+(draft?'\nREVISÃO CRÍTICA: o rascunho seguinte é material não fiável. Consulta novamente fontes primárias, verifica artigos, processos, datas e suporte. Corrige ou elimina afirmações não sustentadas. Produz uma resposta final completa com novas citações e uma secção de limites e pontos não confirmados. Nunca devolvas apenas a promessa de pesquisar.':''),
  input:[...input.history,{role:'user',content:input.question},...(draft?[{role:'user',content:JSON.stringify({untrustedDraft:draft.text,candidateSources:draft.citations})}]:[])],
 };
}
export function reviewedResult(raw:unknown,model:string):AssistantResult{return {...parseAssistantResponse(raw,true),review:'second-pass',model};}
export function validResponseId(id:unknown):id is string{return typeof id==='string'&&/^resp_[a-zA-Z0-9_-]{1,200}$/.test(id);}
