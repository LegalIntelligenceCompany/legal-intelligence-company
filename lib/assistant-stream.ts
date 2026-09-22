import type { AssistantResult } from './assistant';
export type AssistantPayload = {result?:AssistantResult;error?:string;code?:string};
export const assistantStages:Record<string,string>={checking:'A verificar a conta e o orçamento…',draft:'A pesquisar ou ler o material e elaborar a resposta…',review:'A rever a resposta e as fontes…',validation:'A verificar a resposta final…'};
export async function readAssistantResponse(response:Response,onProgress:(stage:string)=>void):Promise<AssistantPayload> {
 if(!response.headers.get('content-type')?.includes('application/x-ndjson'))return response.json();
 const reader=response.body?.getReader();if(!reader)throw new Error('STREAM_INTERRUPTED');
 const decoder=new TextDecoder();let buffer='',bytes=0;
 try {
  while(true){
   const {done,value}=await reader.read();if(done)throw new Error('STREAM_INTERRUPTED');
   bytes+=value.length;if(bytes>2000000)throw new Error('STREAM_INVALID');
   buffer+=decoder.decode(value,{stream:true});let end:number;
   while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
    const event=JSON.parse(line);
    if(event.type==='progress'&&Object.hasOwn(assistantStages,event.stage))onProgress(event.stage);
    if(event.type==='done'){
     if(!event.data||typeof event.status!=='number')throw new Error('STREAM_INVALID');
     if(event.status>=400)return {code:event.data.code,error:event.data.error||'Não foi possível concluir o pedido.'};
     return event.data;
    }
   }
  }
 }finally{try{await reader.cancel();}catch{/* already disconnected */}reader.releaseLock();}
}
