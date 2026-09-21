export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export type Contract = { id: string; organization_id: string; filename: string; storage_path: string; status: string; created_at: string; byte_size: number | null; mime_type: string | null; uploaded_by: string | null };
export type Policy = { id: string; organization_id: string; title: string; content: string; created_at: string; updated_at: string; archived_at: string | null };
export function documentError(error: unknown): string {
  const item = error as { message?: string; code?: string };
  const message = item?.message ?? "";
  if (item?.code === "PGRST202" || item?.code === "42703" || message.includes("schema cache")) return "Esta funcionalidade ainda não foi activada. Execute a actualização 003_documents.sql no Supabase.";
  if (message.includes("UPLOAD_INCOMPLETE")) return "O ficheiro ainda não ficou guardado por completo. Volte a tentar o carregamento.";
  if (message.includes("INVALID_FILE")) return "Escolha um PDF ou DOCX válido, até 20 MB.";
  if (message.includes("INVALID_POLICY")) return "Use um título de 2 a 160 caracteres e um conteúdo de 10 a 100 000 caracteres.";
  if (message.includes("FORBIDDEN") || item?.code === "42501" || message.includes("row-level security")) return "A sua conta não tem permissão para esta empresa ou falta activar as regras de acesso.";
  return "Não foi possível concluir. Verifique a ligação e tente novamente. Se o problema persistir, confirme a configuração do Supabase.";
}
export function contractStatus(status: string) {
  if (status === "uploaded") return "Documento guardado";
  if (status === "uploading") return "Envio incompleto";
  return "Por verificar";
}
export function fileSize(bytes: number | null) {
  return bytes ? `${(bytes / 1024 / 1024).toLocaleString("pt-PT", { maximumFractionDigits: 2 })} MB` : "Tamanho não registado";
}
export async function validateFile(file: File) {
  if (!file.size || file.size > MAX_FILE_BYTES || file.name.length > 255) throw new Error("INVALID_FILE");
  const prefix = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (/\.pdf$/i.test(file.name) && new TextDecoder().decode(prefix) === "%PDF-") return "application/pdf";
  if (/\.docx$/i.test(file.name) && prefix[0] === 0x50 && prefix[1] === 0x4b && prefix[2] === 3 && prefix[3] === 4) return DOCX_MIME;
  throw new Error("INVALID_FILE");
}
