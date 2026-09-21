import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assistantInstructions, parseAssistantResponse, validateAssistantInput } from "@/lib/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const headers = { "Cache-Control": "no-store" };
const messages: Record<string, string> = {
  INVALID_REQUEST: "Pedido inválido ou demasiado longo. A pergunta pode ter até 4000 caracteres.",
  UNAUTHORIZED: "Entre na sua conta para utilizar o assistente.", FORBIDDEN: "Não tem acesso a este pedido ou documento.",
  NOT_CONFIGURED: "O assistente ainda não foi configurado pelo administrador.", SETUP_REQUIRED: "Falta activar a actualização 005_assistant.sql no Supabase.",
  DOCUMENT: "Escolha PDFs guardados e legíveis, até 10 MB no total. DOCX ainda não é suportado neste assistente.",
  RATE_LIMITED: "Foi atingido o limite de utilização: 20 pedidos por conta ou 200 na plataforma, em 24 horas.",
  BUSY: "Já existe um pedido em curso nesta conta. Aguarde até três minutos antes de outro pedido.",
  DUPLICATE: "Este pedido já foi recebido. Não foi iniciada outra chamada à IA.",
  NO_SOURCES: "A pesquisa não devolveu citações utilizáveis. Não apresentámos uma resposta jurídica sem fontes. Esta tentativa pode ter tido custos.",
  INCOMPLETE: "A resposta não ficou completa. A tentativa pode ter tido custos. Tente uma pergunta mais específica.",
  REFUSED: "Não foi possível responder a este pedido. Reformule a pergunta sem dados sensíveis.",
  PROVIDER: "O serviço de IA não concluiu o pedido. A tentativa pode ter tido custos. Não volte a enviar repetidamente.",
};
function fail(code: string, status = 400) { return NextResponse.json({ code, error: messages[code] ?? messages.PROVIDER }, { status, headers }); }
async function readBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error();
  const parts: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 140000) { await reader.cancel(); throw new Error(); } parts.push(value); } return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  finally { reader.releaseLock(); }
}
export async function POST(request: Request) {
  try { return await handle(request); } catch { return fail("PROVIDER", 503); }
}
async function handle(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("FORBIDDEN", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("INVALID_REQUEST");
  let input;
  try { input = validateAssistantInput(await readBody(request)); } catch { return fail("INVALID_REQUEST"); }
  const client = await createClient(true);
  if (!client) return fail("NOT_CONFIGURED", 503);
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) return fail("UNAUTHORIZED", 401);
  const admin = createAdminClient();
  if (!admin || !process.env.OPENAI_API_KEY) return fail("NOT_CONFIGURED", 503);
  let reserved = false;
  try {
    const documents: { storage_path: string; byte_size: number }[] = [];
    for (const id of input.documentIds) {
      const doc = await client.from("contracts").select("storage_path,byte_size,mime_type,status").eq("id", id).eq("organization_id", input.organizationId!).maybeSingle();
      if (doc.error || !doc.data) return fail("FORBIDDEN", 403);
      if (doc.data.status !== "uploaded" || doc.data.mime_type !== "application/pdf" || !(doc.data.byte_size > 0)) return fail("DOCUMENT");
      documents.push(doc.data);
    }
    if (documents.reduce((sum, doc) => sum + doc.byte_size, 0) > 10 * 1024 * 1024) return fail("DOCUMENT");
    const begin = await admin.rpc("assistant_begin", { p_id: input.requestId, p_actor: auth.user.id });
    if (begin.error) {
      const code = ["DUPLICATE", "BUSY", "RATE_LIMITED", "FORBIDDEN"].find(c => begin.error.message.includes(c));
      return fail(code ?? "SETUP_REQUIRED", code ? 429 : 503);
    }
    reserved = true;
    const files = [];
    for (let i = 0; i < documents.length; i++) {
      const downloaded = await client.storage.from("contracts").download(documents[i].storage_path);
      if (downloaded.error || !downloaded.data || downloaded.data.size !== documents[i].byte_size) throw new Error("DOCUMENT");
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("DOCUMENT");
      files.push({ type: "input_file", filename: `Document-${i === 0 ? "A" : "B"}.pdf`, file_data: `data:application/pdf;base64,${bytes.toString("base64")}` });
    }
    const research = input.mode === "research";
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", timeout: 120000, maxRetries: 0 });
    // Private modes intentionally have NO web tools. History is untrusted input.
    const raw = await openai.post<Record<string, unknown>, unknown>("/responses", { body: {
      model: (research ? process.env.OPENAI_RESEARCH_MODEL : process.env.OPENAI_MODEL) || process.env.OPENAI_MODEL || "gpt-5-mini",
      store: false, instructions: assistantInstructions(input), max_output_tokens: 6000, reasoning: { effort: "low" },
      input: [...input.history.map(m => ({ role: m.role, content: m.content })), { role: "user", content: [...files, { type: "input_text", text: input.question }] }],
      ...(research ? { tools: [{ type: "web_search", search_context_size: "medium" }], tool_choice: "required", max_tool_calls: 4 } : {}),
    }, timeout: 120000 });
    const result = parseAssistantResponse(raw, research);
    const finish = await admin.rpc("assistant_finish", { p_id: input.requestId, p_actor: auth.user.id, p_success: true });
    if (finish.error) console.warn("[assistant] quota-finish-failed");
    return NextResponse.json({ result }, { headers });
  } catch (error) {
    const code = error instanceof Error && ["DOCUMENT", "NO_SOURCES", "INCOMPLETE", "REFUSED"].includes(error.message) ? error.message : "PROVIDER";
    if (reserved) {
      try { await admin.rpc("assistant_finish", { p_id: input.requestId, p_actor: auth.user.id, p_success: false }); }
      catch { /* The lease expires even if the database is unavailable. */ }
    }
    // Never log user text, provider bodies, files or credentials.
    console.warn("[assistant]", code);
    return fail(code, 502);
  }
}
