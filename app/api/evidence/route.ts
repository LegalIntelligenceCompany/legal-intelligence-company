import {createClient} from '@/lib/supabase/server';
import {fetchOfficialSource} from '@/lib/source-fetch';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Sem autorização.'},{status:403,headers});
 const client=await createClient(true),user=(await client?.auth.getUser())?.data.user;if(!user)return Response.json({error:'Entre na sua conta.'},{status:401,headers});
 try{
  const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const chunks:Uint8Array[]=[];while(true){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>5000){await reader.cancel();throw Error();}chunks.push(n.value);}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));const source=await fetchOfficialSource(body.url);
  return Response.json({source,warning:'Texto extraído automaticamente. Confirme que corresponde ao documento e à versão pretendidos. O sítio pode apresentar avisos ou páginas de acesso em vez do original.'},{headers});
 }catch{return Response.json({error:'Não foi possível obter texto HTML público desta fonte. Aceitam-se apenas HTTPS do Diário da República, DGSI, EUR-Lex e CURIA. Para PDFs ou páginas protegidas, consulte o original e importe o excerto autorizado.'},{status:422,headers});}
}
