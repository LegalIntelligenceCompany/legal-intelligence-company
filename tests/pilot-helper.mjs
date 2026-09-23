import {readFileSync} from 'node:fs';
import ts from 'typescript';
// Legacy route tests exercise pilot behaviour through the real funding selector.
export function fundingDependencies(deps) {
 const api={};
 const source=ts.transpileModule(readFileSync(new URL('../lib/service-funding.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const meter={commercialMeterEnabled:()=>false,meterMessages:{},reserveCommercialService:async()=>{throw Error('METER_SETUP');}};
 const imports={'server-only':{},'./billing-access':deps['@/lib/billing-access'],'./ai-pilot':deps['@/lib/ai-pilot'],'./commercial-meter':meter};
 new Function('require','exports',source)(name=>imports[name],api);
 return {...deps,'@/lib/service-funding':api,'@/lib/commercial-meter':meter};
}
export function pilotModule(enabled=false) {
 const source=ts.transpileModule(readFileSync(new URL('../lib/ai-pilot.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 class FixedDate extends Date {static now(){return Date.parse('2026-09-22T12:00:00Z');}}
 new Function('exports','process','Date','Buffer',source)(exports,{env:{AI_PILOT_ENABLED:enabled?'true':'false'}},FixedDate,Buffer);
 return exports;
}
