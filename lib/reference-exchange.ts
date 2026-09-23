import 'server-only';
import {ecbSource,parseReferenceExchange} from './tariff-preparation';

// Called only on the authenticated preparation page. No AI/payment calls,
// credentials, fallback rates, persistence or changes to production tariffs.
export async function referenceExchange(){
  try {
    const response=await fetch(ecbSource,{next:{revalidate:3600},redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('FX_UNAVAILABLE');
    const reader=response.body?.getReader();if(!reader)throw Error('FX_UNAVAILABLE');
    let size=0;const chunks:Uint8Array[]=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100_000){await reader.cancel();throw Error('FX_INVALID');}chunks.push(value);}}finally{reader.releaseLock();}
    return parseReferenceExchange(Buffer.concat(chunks).toString('utf8'));
  }catch{return null;}
}
