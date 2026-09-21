import test from "node:test";
import assert from "node:assert/strict";
import { validateReport, validatePolicies, analysisMessage } from "../lib/analysis.ts";

const policy = { id: "e216aacb-ef58-4727-bd14-691a3662c443", title: "Prazo", content: "O aviso prévio é de 30 dias.", updated_at: "2026-09-21" };
const finding = { severity: "high", category: "policy_deviation", title: "Prazo diferente", detail: "O contrato exige 90 dias.", recommendation: "Rever o prazo com a equipa.", contract_quote: "O aviso prévio é de 90 dias.", page: 1, policy_id: policy.id, policy_quote: "O aviso prévio é de 30 dias." };
const report = () => ({ document_readable: true, summary: "Rever prazo.", limitations: ["Confirmar no original."], findings: [{ ...finding }] });
test("accepts supported report and validates policy quote against snapshot", () => assert.deepEqual(validateReport(report(), [policy]), report()));
test("rejects unknown policy, invented quotes and cross-company references", () => {
  for (const patch of [{ policy_id: "other" }, { policy_quote: "inventado" }, { policy_id: null }, { page: -1 }, { page: 1.5 }, { contract_quote: null }, { severity: "approved" }, { title: "" }, { extra: "injection" }]) {
    const value = report(); Object.assign(value.findings[0], patch);
    assert.throws(() => validateReport(value, [policy]), /INVALID_REPORT/);
  }
  assert.throws(() => validateReport(report(), []), /INVALID_REPORT/);
});
test("missing clauses have no fabricated contract quote or page", () => {
  const value = report(); Object.assign(value.findings[0], { category: "missing_clause", contract_quote: null, page: null });
  assert.ok(validateReport(value, [policy]));
  value.findings[0].page = 1;
  assert.throws(() => validateReport(value, [policy]), /INVALID_REPORT/);
});
test("general review cannot claim policy backing", () => {
  const value = report(); value.findings[0].category = "general_review";
  assert.throws(() => validateReport(value, [policy]), /INVALID_REPORT/);
  Object.assign(value.findings[0], { policy_id: null, policy_quote: null });
  assert.ok(validateReport(value, []));
});
test("handles unreadable, oversized and malformed output without accepting conclusions", () => {
  assert.throws(() => validateReport({ ...report(), document_readable: false }, [policy]), /UNREADABLE_DOCUMENT/);
  for (const value of [null, [], {}, { ...report(), summary: "x".repeat(2501) }, { ...report(), findings: Array(21).fill(finding) }, { ...report(), limitations: [42] }, { ...report(), secret: "unexpected" }]) assert.throws(() => validateReport(value, [policy]), /INVALID_REPORT/);
});
test("rejects oversized policy sets instead of silently truncating", () => {
  assert.doesNotThrow(() => validatePolicies([]));
  assert.throws(() => validatePolicies(Array(31).fill(policy)), /POLICIES_TOO_LARGE/);
  assert.throws(() => validatePolicies([{ ...policy, content: "x".repeat(50001) }]), /POLICIES_TOO_LARGE/);
});
test("error messages never echo unknown provider data", () => {
  assert.equal(analysisMessage("private provider error"), analysisMessage("INTERNAL"));
});
