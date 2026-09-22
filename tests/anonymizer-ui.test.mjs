import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as review from '../lib/local-review.ts';
const source=ts.transpileModule(readFileSync(new URL('../components/local-review.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(){
 const states=[];let i=0;const jsx=(type,props)=>({type,props});
 const deps={'react':{useState:initial=>{const n=i++;if(!(n in states))states[n]=initial;return[states[n],v=>states[n]=typeof v==='function'?v(states[n]):v];},useRef:()=>({current:null}),useEffect:()=>{}},'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':()=>null,'./app-shell':()=>null,'./assistant-panel':{downloadReport:()=>{}},'@/lib/local-review':review,'@/lib/legal-research':{safeSourceUrl:()=>null}};
 const mod={exports:{}};new Function('require','module','exports',source)(n=>deps[n],mod,mod.exports);
 const nodes=t=>!t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)];
 const render=()=>{i=0;return nodes(mod.exports.Anonymizer());};
 const submit=()=>render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 const input=(value)=>render().find(n=>n.type==='textarea').props.onChange({target:{value}});
 return{render,submit,input,states};
}
test('detect gives explicit feedback for empty, whitespace, zero matches and successful matches',()=>{
 const h=harness();assert.equal(h.render().find(n=>n.type==='form').props.noValidate,true);
 h.submit();assert.match(h.states[5],/Cole o texto/);assert.equal(h.states[6],false);
 h.input('   ');h.submit();assert.match(h.states[5],/Cole o texto/);
 h.input('Texto sem identificadores.');h.submit();assert.equal(h.states[6],true);assert.equal(h.states[2].length,0);
 h.input('teste@example.com');h.submit();assert.equal(h.states[2].length,1);assert.equal(h.states[5],'');
 assert.ok(h.render().some(n=>n.props?.id==='anonymizer-feedback'&&n.props.tabIndex===-1&&n.props['aria-live']==='polite'));
});
test('detect reports bounds errors instead of silently failing and editing resets old results',()=>{
 const h=harness();h.input('x'.repeat(40001));h.submit();assert.match(h.states[5],/40 000/);assert.equal(h.states[6],false);
 h.input('teste@example.com');h.submit();assert.equal(h.states[6],true);
 h.input('novo');assert.equal(h.states[6],false);assert.deepEqual(h.states[2],[]);
});
