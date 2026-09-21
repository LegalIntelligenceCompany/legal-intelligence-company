import test from "node:test";
import assert from "node:assert/strict";
import { validateFile, MAX_FILE_BYTES, DOCX_MIME, documentError, contractStatus } from "../lib/documents.ts";

test("PDF accepted regardless of browser MIME, using extension and signature", async () => {
  assert.equal(await validateFile(new File(["%PDF-1.7\n"], "CONTRATO.PDF", { type: "" })), "application/pdf");
});
test("DOCX accepts ZIP signature and matching extension", async () => {
  assert.equal(await validateFile(new File([new Uint8Array([80, 75, 3, 4, 0])], "contrato.docx")), DOCX_MIME);
});
test("reject empty, disguised, unsupported and oversized documents", async () => {
  const files = [new File([], "vazio.pdf"), new File(["<html>"], "falso.pdf"), new File(["%PDF-1.7"], "contrato.exe"), new File(["%PDF-", new Uint8Array(MAX_FILE_BYTES)], "grande.pdf"), new File(["text"], "falso.docx")];
  for (const file of files) await assert.rejects(validateFile(file), /INVALID_FILE/);
});
test("client does not mislabel stored documents as analysed", () => {
  assert.equal(contractStatus("uploaded"), "Documento guardado");
  assert.equal(contractStatus("uploading"), "Envio incompleto");
  assert.equal(contractStatus("completed"), "Por verificar");
});
test("missing migration and permission errors have actionable messages", () => {
  assert.match(documentError({ code: "PGRST202" }), /003_documents.sql/);
  assert.match(documentError({ code: "42501" }), /permissão/);
  assert.match(documentError(new Error("UPLOAD_INCOMPLETE")), /carregamento/);
});
