"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { documentError, validateFile, type Contract } from "@/lib/documents";
import type { Company } from "./company-workspace";

export function ContractUpload({ company, existing, onSaved }: { company: Company; existing?: Contract; onSaved?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const [saved, setSaved] = useState<Contract | null>(null);
  const pending = useRef<Contract | null>(existing ?? null);
  const running = useRef(false);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file || running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      const client = createClient(); if (!client) throw new Error();
      setStage("A verificar o ficheiro…");
      const mime = await validateFile(file);
      if (existing && (file.name !== existing.filename || file.size !== existing.byte_size || mime !== existing.mime_type)) {
        setStage(""); setError("Seleccione o ficheiro original, com o mesmo nome, tamanho e formato. Para outro documento, use Novo contrato."); return;
      }
      if (!pending.current) {
        const record = await client.rpc("contract_begin", { org_id: company.id, file_name: file.name, file_bytes: file.size, file_mime: mime });
        if (record.error) throw record.error;
        const created = Array.isArray(record.data) ? record.data[0] : record.data;
        if (!created?.id || !created?.storage_path) throw new Error("Invalid contract response");
        pending.current = created as Contract;
      }
      const record = pending.current!;
      setStage("A guardar o ficheiro privado…");
      const { error: uploadError } = await client.storage.from("contracts").upload(record.storage_path, file, { contentType: mime, upsert: false, cacheControl: "0" });
      // A retry may find the first upload already succeeded. Finishing checks its metadata.
      if (uploadError && String(uploadError.statusCode) !== "409" && !uploadError.message.toLowerCase().includes("already exists")) throw uploadError;
      setStage("A confirmar o carregamento…");
      const result = await client.rpc("contract_finish", { contract_id: record.id });
      if (result.error) throw result.error;
      setSaved({ ...record, status: "uploaded" }); setStage("");
      onSaved?.();
    } catch (failure) { setStage(""); setError(documentError(failure)); }
    finally { setBusy(false); running.current = false; }
  }
  return <>
    <Link className="team-back" href="/contracts">← Voltar aos contratos</Link>
    <section className="card team-panel">
      {saved ? <><h2>Contrato guardado</h2><p role="status"><strong>{saved.filename}</strong> foi guardado em {company.name} e está disponível para os membros desta empresa.</p><p className="team-muted">O documento foi guardado sem enviar dados à IA. Abra o contrato para iniciar a análise de um PDF até 10 MB, mediante autorização.</p><div className="workspace-toolbar"><Link className="btn btn-primary" href={`/contracts/${saved.id}`}>Abrir contrato</Link><button className="btn btn-secondary" onClick={() => { setSaved(null); setFile(null); pending.current = null; }}>Carregar outro</button></div></> : <form onSubmit={upload}>
        <label className="upload-area" htmlFor="contract-file"><strong>{existing ? "Volte a seleccionar o ficheiro original" : "Seleccione o contrato"}</strong><span>PDF ou DOCX · até 20 MB</span><input id="contract-file" type="file" accept=".pdf,.docx" required disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); pending.current = existing ?? null; setError(""); }}/></label>
        <p className="team-muted">O ficheiro será guardado em <strong>{company.name}</strong>. O acesso é reservado aos membros desta empresa.</p>
        {stage && <p role="status">{stage}</p>}{error && <p role="alert" className="workspace-error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={!file || busy}>{busy ? "A guardar…" : pending.current ? "Tentar novamente" : "Guardar contrato privado"}</button>
        {pending.current && !busy && <p className="team-muted">Se sair desta página, o envio incompleto permanece na biblioteca. Pode abrir esse registo para o recuperar.</p>}
      </form>}
    </section>
  </>;
}
