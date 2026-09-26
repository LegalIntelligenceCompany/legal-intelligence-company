import {pathToFileURL} from 'node:url';

// Fixed target and read-only requests. No session, API keys, payment or generation.
export const origin='https://legal-intelligence-company.vercel.app';
export const probes=[
 {path:'/login',method:'GET',status:200,html:true},
 {path:'/api/research',method:'GET',status:401},
 {path:'/api/recoveries',method:'GET',status:401},
 {path:'/api/maintenance/recovery',method:'GET',status:401},
 {path:'/api/maintenance/research',method:'GET',status:401},
 {path:'/api/live-credits',method:'GET',status:403},
 {path:'/document-runtime/pdf.worker.min.mjs',method:'HEAD',status:200},
 {path:'/document-runtime/worker.min.js',method:'HEAD',status:200},
 {path:'/document-runtime/por.traineddata.gz',method:'HEAD',status:200},
 {path:'/document-runtime/eng.traineddata.gz',method:'HEAD',status:200},
];

export async function checkPublished({fetcher=fetch,concurrency=2}={}){
 const results=[];let cursor=0;
 async function worker(){
  while(cursor<probes.length){
   const probe=probes[cursor++],start=Date.now();
   try{
    const response=await fetcher(origin+probe.path,{method:probe.method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'LIC-availability-check/1.0'}});
    const problems=[];
    if(response.status!==probe.status)problems.push(`HTTP ${response.status}, esperado ${probe.status}`);
    if(probe.html){
     if(!response.headers.get('content-type')?.includes('text/html'))problems.push('HTML ausente');
     if(response.headers.get('x-content-type-options')!=='nosniff')problems.push('protecção MIME ausente');
     if(response.headers.get('x-frame-options')!=='DENY')problems.push('protecção de enquadramento ausente');
    }
    // Do not retain or print response bodies, cookies or service configuration.
    await response.body?.cancel();
    results.push({path:probe.path,ok:problems.length===0,ms:Date.now()-start,problems});
   }catch{results.push({path:probe.path,ok:false,ms:Date.now()-start,problems:['Sem resposta dentro do limite ou falha de ligação']});}
  }
 }
 await Promise.all(Array.from({length:Math.max(1,Math.min(4,Math.floor(concurrency)||1))},worker));
 return results;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const results=await checkPublished();
 for(const r of results)console.log(`${r.ok?'OK':'FALHOU'} ${r.path} (${r.ms} ms)${r.problems.length?' — '+r.problems.join('; '):''}`);
 console.log('Verificação pública apenas: não comprova sessões autenticadas, qualidade de IA, limpeza executada ou pagamentos.');
 if(results.some(r=>!r.ok))process.exitCode=1;
}
