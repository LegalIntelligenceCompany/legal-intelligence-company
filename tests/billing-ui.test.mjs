import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
function render(summary=null,login=false,busy=false) {
  let i=0;
  const states=['Estado de teste',summary,busy,login,''];
  const deps={react:{...React,useState:()=>[states[i++],()=>{}],useCallback:f=>f,useEffect:()=>{},useRef:initial=>({current:initial})},'react/jsx-runtime':jsx,'next/link':({href,children,...props})=>React.createElement('a',{href,...props},children)};
  const source=ts.transpileModule(readFileSync(new URL('../components/billing-panel.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports={}; new Function('require','exports',source)(n=>deps[n],exports);
  return renderToStaticMarkup(React.createElement(exports.BillingPanel));
}
const summary={canCheckout:false,canManage:true,subscriptions:[{id:'sub_test',status:'active',periodEnd:'2026-10-21T00:00:00Z',cancelAtPeriodEnd:true,paid:true}],entitlement:{eligible:true,limits:{assistant:20,analysis:5}},usage:{assistant:3,analysis:1}};
test('billing renders login and setup without offering unauthenticated checkout',()=>{
  const html=render(null,true); assert.match(html,/login\?next=\/billing/); assert.match(html,/\/setup\/billing/); assert.doesNotMatch(html,/Abrir checkout de teste/);
});
test('billing shows cancellation, test quotas and portal without duplicate checkout',()=>{
  const html=render(summary); assert.match(html,/Cancelamento agendado/); assert.match(html,/3 \/ 20/); assert.match(html,/Gerir subscrição/); assert.match(html,/Não fazem chamadas à IA/); assert.doesNotMatch(html,/Abrir checkout de teste/);
});
test('ineligible and busy simulation controls are disabled',()=>{
  for(const html of [render({...summary,entitlement:{...summary.entitlement,eligible:false}}),render(summary,false,true)]) {
    assert.match(html,/disabled="">Simular pedido de chat/); assert.match(html,/disabled="">Simular análise/);
  }
});
