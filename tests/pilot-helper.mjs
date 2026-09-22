import {readFileSync} from 'node:fs';
import ts from 'typescript';
export function pilotModule(enabled=false) {
 const source=ts.transpileModule(readFileSync(new URL('../lib/ai-pilot.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 class FixedDate extends Date {static now(){return Date.parse('2026-09-22T12:00:00Z');}}
 new Function('exports','process','Date','Buffer',source)(exports,{env:{AI_PILOT_ENABLED:enabled?'true':'false'}},FixedDate,Buffer);
 return exports;
}
