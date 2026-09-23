import { NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paidAIAccessError } from '@/lib/billing-access';
import { pilotMessages, validatePilotWav } from '@/lib/ai-pilot';
import {serviceAccessError,reserveService} from '@/lib/service-funding';
import {meterMessages,recordCommercialAudio,settleCommercialResearch} from '@/lib/commercial-meter';
import { MAX_AUDIO_BYTES, audioExtension, validateAudio, transcriptionText } from '@/lib/transcription';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
const headers={'Cache-Control':'no-store'};
const errors:Record<string,string>={UNAUTHORIZED:'Entre na sua conta.',FORBIDDEN:'Pedido não autorizado.',INVALID:'Confirme o consentimento e os dados do pedido.',SIZE:'Escolha áudio não vazio até 3 MB.',FORMAT:'Formato inválido. Use MP3, M4A, MP4, WAV ou WebM.',AI_PAUSED:'A transcrição paga ainda não está activa. Não enviámos o áudio à IA.',BILLING_TEST_ONLY:'Os pagamentos estão em teste. Não enviámos o áudio à IA.',SETUP:'O serviço ainda não está configurado.',BUSY:'Já existe um pedido em curso. Aguarde antes de tentar novamente.',DUPLICATE:'Este pedido já foi recebido; não foi repetido.',RATE_LIMITED:'Limite diário partilhado com o assistente atingido.',EMPTY:'Não foi possível obter texto utilizável. Não foi inventada uma transcrição.',PROVIDER:'Não foi possível concluir a transcrição. A tentativa pode ter tido custos; não repita de imediato.'};
function fail(code:string,status=400){return NextResponse.json({code,error:meterMessages[code]||pilotMessages[code]||errors[code]||errors.PROVIDER},{status,headers});}
export async function GET(){try{const client=await createClient(true);const auth=await client?.auth.getUser();if(!auth?.data.user||auth.error)return fail('UNAUTHORIZED',401);const pilot=!paidAIAccessError(auth.data.user);const code=process.env.AI_EXECUTION_ENABLED!=='true'?'AI_PAUSED':serviceAccessError(auth.data.user);return NextResponse.json({enabled:!code,pilot,message:code?(pilotMessages[code]||errors[code]):pilot?'Teste económico: apenas WAV PCM de 16 bits até 60 segundos. Reserva de 0,20 € por tentativa, não reembolsada automaticamente. Consulte /setup/pilot.':''},{headers});}catch{return fail('SETUP',503);}}
export async function POST(request:Request){
 let reserved=false;let admin:ReturnType<typeof createAdminClient>=null;let actor='';let id='';
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin)return fail('FORBIDDEN',403);
  id=request.headers.get('x-request-id')||'';
  const language=request.headers.get('x-audio-language')||'auto';
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||request.headers.get('x-audio-consent')!=='true'||!['auto','pt','en','es','fr'].includes(language))return fail('INVALID');
  const client=await createClient(true);const auth=await client?.auth.getUser();if(!auth?.data.user||auth.error)return fail('UNAUTHORIZED',401);actor=auth.data.user.id;
  if(process.env.AI_EXECUTION_ENABLED!=='true')return fail('AI_PAUSED',503);
  const billing=serviceAccessError(auth.data.user);if(billing)return fail(billing,403);
  admin=createAdminClient();if(!admin||!process.env.OPENAI_API_KEY)return fail('SETUP',503);
  const ext=audioExtension('audio.'+(request.headers.get('x-audio-extension')||''));
  if(Number(request.headers.get('content-length'))>MAX_AUDIO_BYTES)return fail('SIZE',413);
  const reader=request.body?.getReader();if(!reader)return fail('SIZE');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_AUDIO_BYTES){await reader.cancel();return fail('SIZE',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks);validateAudio(bytes,ext);
  if(!request.headers.get('x-credit-wallet')&&!paidAIAccessError(auth.data.user))validatePilotWav(bytes,ext);
  const begin=await admin.rpc('assistant_begin',{p_id:id,p_actor:actor});
  if(begin.error){const code=['BUSY','DUPLICATE','RATE_LIMITED'].find(c=>begin.error.message.includes(c));return fail(code||'SETUP',code?429:503);}reserved=true;
  const meter=await reserveService(admin,auth.data.user,id,'transcription','transcription',request);
  const openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:'https://api.openai.com/v1',timeout:120000,maxRetries:0});
  const {data:result,response}=await openai.audio.transcriptions.create({file:await toFile(bytes,`audio.${ext}`),model:meter?.plan[0].tariff.model||'gpt-4o-mini-transcribe',response_format:'json',...(language==='auto'?{}:{language})}).withResponse();
  if(meter)await recordCommercialAudio(admin,actor,meter,result,response.headers.get('x-request-id')||'');
  const text=transcriptionText(result);
  const chargedCents=meter?await settleCommercialResearch(admin,actor,id):undefined;
  // No audio or transcript is persisted. Only the existing quota request is recorded.
  try{await admin.rpc('assistant_finish',{p_id:id,p_actor:actor,p_success:true});}catch{/* lease expires */}
  return NextResponse.json({text,chargedCents,generatedAt:new Date().toISOString()},{headers});
 }catch(error){if(reserved&&admin){try{await admin.rpc('assistant_finish',{p_id:id,p_actor:actor,p_success:false});}catch{/* lease expires */}}
 const code=error instanceof Error&&(['FORMAT','SIZE','EMPTY'].includes(error.message)||Object.hasOwn(pilotMessages,error.message)||Object.hasOwn(meterMessages,error.message))?error.message:'PROVIDER';return fail(code,code==='PROVIDER'||code==='EMPTY'?502:400);}
}
