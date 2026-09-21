import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as analysis from "../lib/analysis.ts";
import * as research from "../lib/legal-research.ts";

// Compile the route in memory and inject test doubles. No credentials, network or paid calls.
const source = ts.transpileModule(readFileSync(new URL("../app/api/analyse/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const id = "e216aacb-ef58-4727-bd14-691a3662c443";
const org = "e216aacb-ef58-4727-bd14-691a3662c444";
const actor = "e216aacb-ef58-4727-bd14-691a3662c445";
const pdf = new Blob(["%PDF-1.7 synthetic fixture"], { type: "application/pdf" });
const validReport = { document_readable: true, summary: "Revisão fictícia para teste.", limitations: ["Teste."], findings: [] };
const validPlan = { document_readable: true, countries: ["PT"], explicit_law: true, contract_type: "services", topics: ["termination"] };
const researchOutput = { status: "completed", output: [
  { type: "web_search_call", status: "completed", action: { type: "search", sources: [{ url: "https://diariodarepublica.pt/dr/legislacao-consolidada/test-fixture", title: "Fonte fictícia para teste" }] } },
  { type: "message", content: [{ type: "output_text", text: "Informação fictícia de teste; não é aconselhamento.", annotations: [{ type: "url_citation", url: "https://diariodarepublica.pt/dr/legislacao-consolidada/test-fixture", title: "Fonte fictícia para teste" }] }] },
] };
function setup(options = {}) {
  const calls = { provider: [], research: [], rpc: [], filters: [], downloads: [], diagnostics: [] };
  const contract = options.contract === undefined ? { id, organization_id: org, status: "uploaded", mime_type: "application/pdf", byte_size: pdf.size, storage_path: `${org}/${id}.pdf` } : options.contract;
  const job = { id, contract_id: id, status: "processing", policy_snapshot: [], model: "gpt-5-mini" };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: actor } }, error: null }) },
    from(table) {
      const query = {
        select() { return query; }, eq(field, value) { calls.filters.push([table, field, value]); return query; }, order() { return query; }, limit() { return query; },
        async maybeSingle() { return { data: table === "contracts" ? contract : job, error: table === "contract_analyses" ? options.readError : null }; },
      }; return query;
    },
    storage: { from: () => ({ download: async path => { calls.downloads.push(path); return { data: pdf, error: null }; } }) },
  };
  const admin = { rpc: async (name, args) => {
    calls.rpc.push([name, args]);
    if (name === "analysis_begin") return { data: { created: !options.reused, job }, error: options.claimError ?? null };
    return { data: !options.saveError, error: options.saveError ? { message: "private error" } : null };
  } };
  class APIError extends Error { constructor(status) { super("private error"); this.status = status; this.cause = { code: options.causeCode, message: "secret document" }; this.code = options.errorCode; this.headers = { authorization: "secret key" }; } }
  class TimeoutError extends APIError {}
  class OpenAI {
    static APIError = APIError; static APIConnectionTimeoutError = TimeoutError;
    responses = { create: async params => {
      calls.provider.push(params);
      if (options.providerStatus) throw new APIError(options.providerStatus);
      if (options.timeout) throw new TimeoutError();
      if (options.output) return options.output;
      return { status: "completed", output: [], output_text: JSON.stringify(params.text.format.name === "legal_research_plan" ? (options.plan ?? validPlan) : (options.report ?? validReport)) };
    } };
    async post(path, optionsArg) {
      calls.research.push({ path, ...optionsArg });
      if (options.researchFailure) throw new APIError(503);
      return options.researchOutput ?? researchOutput;
    }
  }
  const modules = {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    openai: OpenAI,
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/admin": { createAdminClient: () => options.noAdmin ? null : admin },
    "@/lib/analysis": analysis,
    "@/lib/legal-research": research,
  };
  const exports = {};
  new Function("require", "exports", "process", "Buffer", "console", source)(name => { if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name]; }, exports, { env: { OPENAI_API_KEY: options.noKey ? "" : "test-only-not-a-real-key", SUPABASE_SERVICE_ROLE_KEY: "test-only" } }, Buffer, { warn: (...args) => calls.diagnostics.push(args) });
  return { route: exports, calls };
}
function request(patch = {}, origin = "http://localhost:3000") { return new Request("http://localhost:3000/api/analyse", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ contractId: id, organizationId: org, consent: true, researchConsent: true, jurisdiction: "AUTO", rerun: false, ...patch }) }); }
test("route blocks CSRF, missing consent, malformed ids and huge bodies before paid work", async () => {
  for (const req of [request({}, "https://evil.invalid"), request({ consent: false }), request({ researchConsent: false }), request({ jurisdiction: "private-company-name" }), request({ contractId: "invalid" }), request({ padding: "x".repeat(2048) })]) {
    const { route, calls } = setup(); assert.ok((await route.POST(req)).status >= 400); assert.equal(calls.provider.length, 0); assert.equal(calls.rpc.length, 0);
  }
});
test("unauthenticated and cross-company contract requests cannot start work", async () => {
  for (const options of [{ unauthorized: true }, { contract: null }]) {
    const { route, calls } = setup(options); const response = await route.POST(request());
    assert.ok([401, 404].includes(response.status)); assert.equal(calls.provider.length, 0); assert.equal(calls.rpc.length, 0);
  }
});
test("missing configuration does not generate fake findings", async () => {
  const { route, calls } = setup({ noKey: true }); const response = await route.POST(request());
  assert.equal((await response.json()).code, "NOT_CONFIGURED"); assert.equal(calls.provider.length, 0);
});
test("claim errors and duplicate in-flight jobs do not call OpenAI", async () => {
  for (const options of [{ reused: true }, { claimError: { message: "RATE_LIMITED" } }, { claimError: { message: "ANALYSIS_BUSY" } }, { claimError: { code: "PGRST202" } }]) {
    const { route, calls } = setup(options); await route.POST(request()); assert.equal(calls.provider.length, 0);
  }
});
test("success authorizes via current user, scopes reads, disables storage/retries and saves verified output", async () => {
  const { route, calls } = setup(); const response = await route.POST(request({ actor_id: "attacker" }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { id, status: "completed" });
  assert.equal(calls.rpc[0][1].actor_id, actor);
  assert.ok(calls.filters.some(item => item[1] === "organization_id" && item[2] === org));
  assert.equal(calls.downloads[0], `${org}/${id}.pdf`);
  assert.equal(calls.provider.length, 2); assert.equal(calls.provider[0].store, false);
  assert.equal(calls.provider[0].text.format.strict, true); assert.equal(calls.provider[0].tools, undefined);
  assert.equal(calls.provider[1].tools, undefined);
  assert.equal(calls.research.length, 1);
  assert.equal(calls.research[0].body.tool_choice, "required");
  assert.equal(calls.research[0].body.store, false);
  assert.equal(calls.research[0].body.tools[0].external_web_access, true);
  assert.ok(!JSON.stringify(calls.research).includes("file_data"));
  assert.ok(!JSON.stringify(calls.research).includes(actor));
  const saved = calls.rpc.at(-1)[1].result_report;
  assert.equal(saved.summary, validReport.summary);
  assert.equal(saved.research.status, "completed");
  assert.equal(saved.research.sources[0].id, "S1");
});
test("invalid model JSON is rejected and marks job failed without storing findings", async () => {
  for (const output of [{ status: "completed", output: [], output_text: "not-json" }, { status: "incomplete", output: [], output_text: JSON.stringify(validReport) }, { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }], output_text: "" }]) {
    const { route, calls } = setup({ output }); const response = await route.POST(request());
    assert.equal(response.status, 502); assert.equal(calls.rpc.at(-1)[1].result_report, null);
    assert.ok(["INVALID_REPORT", "REFUSED"].includes(calls.rpc.at(-1)[1].failure_code));
  }
});
test("provider failures are safe and never returned verbatim", async () => {
  for (const [options, code] of [[{ providerStatus: 401 }, "PROVIDER_AUTH"], [{ providerStatus: 429 }, "PROVIDER_LIMIT"], [{ timeout: true }, "TIMEOUT"]]) {
    const { route, calls } = setup(options); const response = await route.POST(request()); const data = await response.json();
    assert.equal(data.code, code); assert.ok(!JSON.stringify(data).includes("private error")); assert.equal(calls.rpc.at(-1)[1].failure_code, code);
  }
});
test("failed persistence is not reported as a completed analysis", async () => {
  const { route } = setup({ saveError: true }); const response = await route.POST(request()); assert.equal((await response.json()).code, "SAVE_FAILED");
});
test("diagnostics identify stage and safe network code without logging secrets", async () => {
  const { route, calls } = setup({ providerStatus: 503, causeCode: "ECONNRESET", errorCode: "secret key" });
  const data = await (await route.POST(request())).json();
  assert.deepEqual(data.diagnostic, { reference: id, stage: "classification" });
  const diagnostic = JSON.parse(calls.diagnostics[0][1]);
  assert.equal(diagnostic.http_status, 503); assert.equal(diagnostic.network_code, "ECONNRESET");
  assert.equal(diagnostic.provider_code, null);
  assert.deepEqual(Object.keys(diagnostic).sort(), ["reference", "stage", "code", "elapsed_ms", "http_status", "network_code", "provider_code"].sort());
  assert.doesNotMatch(JSON.stringify(calls.diagnostics), /private error|secret|file_data|authorization|test-only/);
});
test("validation, research and persistence failures have distinct diagnostic stages", async () => {
  for (const [options, stage] of [[{ output: { status: "incomplete", output: [] } }, "classification_validation"], [{ researchFailure: true }, "research"], [{ saveError: true }, "persistence"], [{ report: { ...validReport, document_readable: false } }, "report_validation"]]) {
    const { route, calls } = setup(options); await route.POST(request());
    assert.ok(calls.diagnostics.some(entry => JSON.parse(entry[1]).stage === stage));
  }
});
test("GET requires login, reports missing migration and marks responses no-store", async () => {
  const url = `http://localhost:3000/api/analyse?contractId=${id}&organizationId=${org}`;
  const missing = setup({ unauthorized: true }); assert.equal((await missing.route.GET(new Request(url))).status, 401);
  const schema = setup({ readError: { code: "PGRST205" } }); assert.equal((await (await schema.route.GET(new Request(url))).json()).code, "SETUP_REQUIRED");
  const normal = setup(); const response = await normal.route.GET(new Request(url)); assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.equal(normal.calls.rpc.length, 0);
});
test("research failure is persisted as an explicit partial report, never a successful legal review", async () => {
  const { route, calls } = setup({ researchFailure: true }); const response = await route.POST(request());
  assert.equal(response.status, 200);
  const saved = calls.rpc.at(-1)[1].result_report;
  assert.equal(saved.research.status, "unavailable"); assert.match(saved.research.warning, /parcial/);
  assert.deepEqual(saved.research.sources, []); assert.equal(calls.research.length, 1);
});
test("ambiguous law skips research rather than guessing from contract language", async () => {
  const { route, calls } = setup({ plan: { ...validPlan, explicit_law: false, countries: [] } });
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(calls.research.length, 0);
  assert.equal(calls.rpc.at(-1)[1].result_report.research.status, "jurisdiction_unclear");
});
test("user can specify applicable law without putting free text into search", async () => {
  const { route, calls } = setup({ plan: { ...validPlan, explicit_law: false, countries: [] } });
  assert.equal((await route.POST(request({ jurisdiction: "BR" }))).status, 200);
  assert.match(calls.research[0].body.input, /Brasil/);
  assert.equal(calls.rpc.at(-1)[1].result_report.research.jurisdiction_basis, "user");
});
test("legal claims with invented citations cannot be persisted", async () => {
  const { route, calls } = setup({ report: { ...validReport, findings: [{ severity: "high", category: "legal_issue", title: "Teste", detail: "Teste", recommendation: "Teste", contract_quote: "Cláusula fictícia", page: 1, policy_id: null, policy_quote: null, proposed_wording: "Proposta", legal_basis: [{ source_id: "invented", reference: "artigo", applicability: "Teste", temporal_status: "unconfirmed", temporal_note: "Teste" }] }] } });
  assert.equal((await route.POST(request())).status, 502);
  assert.equal(calls.rpc.at(-1)[1].failure_code, "INVALID_REPORT"); assert.equal(calls.rpc.at(-1)[1].result_report, null);
});
