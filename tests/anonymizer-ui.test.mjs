import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as review from '../lib/local-review.ts';
const source=ts.transpileModule(readFileSync(new URL('../components/local-review.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(){
 const states=[],refs=[],effects=[],queue=[],focused=[],scrolled=[];let i=0,ri=0,ei=0;const jsx=(type,props)=>({type,props});
 const deps={'react':{useState:initial=>{const n=i++;if(!(n in states))states[n]=initial;return[states[n],v=>states[n]=typeof v==='function'?v(states[n]):v];},useRef:()=>{const n=ri++;return refs[n]??(refs[n]={current:null});},useEffect:(fn,ds)=>{const n=ei++;if(!effects[n]||ds.some((v,j)=>v!==effects[n][j])){effects[n]=ds;queue.push(fn);}}},'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':()=>null,'./app-shell':()=>null,'./assistant-panel':{downloadReport:()=>{}},'@/lib/local-review':review,'@/lib/legal-research':{safeSourceUrl:()=>null}};
 const mod={exports:{}};new Function('require','module','exports',source)(n=>deps[n],mod,mod.exports);
 const nodes=t=>!t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)];
 const render=()=>{i=ri=ei=0;const tree=nodes(mod.exports.Anonymizer());for(const r of refs)r.current=null;for(const n of tree)if(n.props?.ref)n.props.ref.current={focus:()=>focused.push(n.props.id),scrollIntoView:()=>scrolled.push(n.props.id)};while(queue.length)queue.shift()();return tree;};
 const submit=()=>render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 const input=(value)=>render().find(n=>n.type==='textarea').props.onChange({target:{value}});
 return{render,submit,input,states,focused,scrolled};
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
test('select, deselect and substitute update feedback and focus the result even on repeated clicks',()=>{
 const h=harness(),button=name=>h.render().find(n=>n.type==='button'&&n.props.children===name);
 h.input('Contacto: teste@example.com');h.submit();
 const replace='Substituir apenas as ocorrências seleccionadas';
 assert.equal(button(replace).props.disabled,true);
 button('Seleccionar todas').props.onClick();assert.equal(button(replace).props.disabled,false);
 assert.match(h.render().find(n=>n.props?.id==='selection-feedback').props.children,/1 de 1 seleccionadas/);
 button('Desmarcar todas').props.onClick();assert.equal(button(replace).props.disabled,true);
 button('Seleccionar todas').props.onClick();button(replace).props.onClick();h.render();
 assert.equal(h.states[4],'Contacto: [EMAIL_1]');assert.equal(h.states[0],'Contacto: teste@example.com');
 assert.equal(h.focused.at(-1),'anonymizer-result');assert.equal(h.scrolled.at(-1),'anonymizer-result');
 const count=h.scrolled.length;button(replace).props.onClick();h.render();assert.equal(h.scrolled.length,count+1);
 button('Desmarcar todas').props.onClick();assert.ok(!h.render().some(n=>n.props?.id==='anonymizer-result'));
});
