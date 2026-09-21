import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as analysis from "../lib/analysis.ts";
import * as research from "../lib/legal-research.ts";

const source = ts.transpileModule(readFileSync(new URL("../components/contract-analysis.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function render(report, states = {}) {
  let stateIndex = 0;
  const job = report ? { status: "completed", id: "fixture", created_at: "2026-09-21T00:00:00Z", model: "test", policy_snapshot: [], report } : null;
  const modules = {
    react: { ...React, useState: initial => { const index = stateIndex++; return [Object.hasOwn(states, index) ? states[index] : index === 0 ? job : index === 1 ? true : index === 2 ? false : initial, () => {}]; }, useEffect: () => {}, useRef: value => ({ current: value }), useCallback: callback => callback },
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children),
    "@/lib/analysis": analysis, "@/lib/legal-research": research,
  };
  const exports = {};
  new Function("require", "exports", source)(name => { if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name]; }, exports);
  return renderToStaticMarkup(React.createElement(exports.ContractAnalysis, { contract: { id: "fixture", organization_id: "test-org", status: "uploaded", mime_type: "application/pdf", byte_size: 100 } }));
}
const oldReport = { summary: "Relatório anterior", limitations: [], findings: [] };
test("old reports are identified as lacking web research", () => assert.match(render(oldReport), /anterior à pesquisa jurídica na web/));
test("new analysis requires a jurisdiction choice and renewed research consent", () => {
  const html = render(null);
  assert.match(html, /País da lei aplicável/); assert.match(html, /fornecedores de pesquisa/); assert.match(html, /custos de IA e pesquisa/);
  assert.match(html, /disabled=""[^>]*>Analisar contrato/);
});
test("research links and proposed wording render next to findings without executing model HTML", () => {
  const metadata = { version: 1, status: "completed", researched_at: "2026-09-21T00:00:00Z", model: "test", countries: ["PT"], jurisdiction_basis: "user", topics: ["termination"], search_calls: 1, warning: "Verificar fontes", sources: [{ id: "S1", url: "https://www.dgsi.pt/test-fixture", title: "Fonte de teste", cited: true, official_domain: true }] };
  const finding = { severity: "high", category: "legal_issue", title: "Problema de teste", detail: "Rever", recommendation: "Confirmar", contract_quote: "Texto fictício", page: 1, policy_id: null, proposed_wording: "<script>private()</script>", legal_basis: [{ source_id: "S1", reference: "Referência de teste", applicability: "Confirmar aplicação", temporal_status: "unconfirmed", temporal_note: "Verificar vigência" }] };
  const html = render({ ...oldReport, research: metadata, findings: [finding] });
  assert.match(html, /href="https:\/\/www.dgsi.pt\/test-fixture"/); assert.match(html, /noopener noreferrer/);
  assert.match(html, /Fundamentação e aplicabilidade/); assert.match(html, /Copiar proposta/);
  assert.ok(!html.includes("<script>private()")); assert.match(html, /&lt;script&gt;/);
});
test("failed research gets a prominent incomplete-review notice", () => {
  const meta = research.emptyResearch({ countries: ["PT"], topics: ["termination"] }, "PT", "test", "2026-09-21T00:00:00Z", "unavailable");
  const html = render({ ...oldReport, research: meta }); assert.match(html, /Pesquisa jurídica incompleta/); assert.match(html, /revisão abaixo é parcial/);
});
test("persisted and transient errors render one alert with stage and reference", () => {
  const message = analysis.analysisMessage("PROVIDER_UNAVAILABLE");
  const html = render(null, { 0: { id: "test-reference", status: "failed", error_code: "PROVIDER_UNAVAILABLE" }, 7: message, 10: { reference: "test-reference", stage: "comparison" } });
  assert.equal(html.split(message).length - 1, 1);
  assert.equal(html.split('role="alert"').length - 1, 1);
  assert.match(html, /Comparação e propostas de alteração/);
  assert.match(html, /Referência de diagnóstico: test-reference/);
});
