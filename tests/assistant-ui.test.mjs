import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
const source = ts.transpileModule(readFileSync(new URL("../components/assistant-panel.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function render(states = {}, organizationId) {
  let index = 0;
  const deps = {
    react: { ...React, useState: initial => { const i = index++; return [Object.hasOwn(states, i) ? states[i] : initial, () => {}]; }, useRef: initial => ({ current: initial }), useEffect: () => {} },
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children),
    "@/lib/supabase/client": { createClient: () => null },
    "@/lib/assistant": { profiles: ["Geral", "Estudante", "Professor", "Advogado", "Empresa"] },
  };
  const exports = {}; new Function("require", "exports", source)(name => { if (!(name in deps)) throw new Error(name); return deps[name]; }, exports);
  return renderToStaticMarkup(React.createElement(exports.AssistantPanel, { organizationId }));
}
test("research signup accepts individuals and shows educational profiles", () => {
  const html = render({ 5: "login" }); assert.match(html, /Não precisa de empresa/); assert.match(html, /Estudante/); assert.match(html, /Professor/); assert.match(html, /href="\/login\?next=\/chat"/);
  assert.equal((html.match(/Entrar para perguntar/g) || []).length, 3);
});
test("send remains disabled without consent and private modes explain no web search", () => {
  const html = render({ 5: "ready", 3: "Uma pergunta" }); assert.match(html, /disabled="">Enviar pergunta/); assert.match(html, /fornecedores de pesquisa/);
  const doc = render({ 5: "ready" }, "test-company"); assert.match(doc, /Sem pesquisa web neste modo/); assert.match(doc, /Comparar versões/); assert.match(doc, /Extrair obrigações/);
});
test("model text is escaped, provider citations are inline and export is available", () => {
  const text = "<script>alert(1)</script> [fonte]";
  const html = render({ 5: "ready", 9: [{ question: "Teste", result: { text, generatedAt: "2026-09-21T12:00:00Z", researched: true, citations: [{ start: 26, end: 33, title: "Fonte", url: "https://diariodarepublica.pt/test" }] } }] });
  assert.ok(!html.includes("<script>")); assert.match(html, /&lt;script&gt;/); assert.match(html, /noopener noreferrer/); assert.match(html, /Exportar resposta e fontes/); assert.match(html, /vigência a confirmar/);
});
test("calendar requires human confirmation and does not claim automated email", () => {
  const html = render({ 0: "obligations", 5: "ready", 9: [{ question: "Prazos", result: { text: "Confirmar data", generatedAt: "2026-09-21T12:00:00Z", citations: [] } }] }, "test-company");
  assert.match(html, /site não envia e-mails/); assert.match(html, /disabled="">Exportar para calendário/);
});
