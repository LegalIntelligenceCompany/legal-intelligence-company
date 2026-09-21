"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { documentError, contractStatus, fileSize, type Contract } from "@/lib/documents";
import type { Company } from "./company-workspace";
import { ContractUpload } from "./contract-upload";
import { ContractAnalysis } from "./contract-analysis";

export function ContractDetail({ company, id }: { company: Company; id: string }) {
  const [record, setRecord] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const client = createClient(); if (!client) throw new Error();
      const result = await client.from("contracts").select("*").eq("organization_id", company.id).eq("id", id).maybeSingle();
      if (result.error) throw result.error;
      setRecord(result.data);
    } catch (failure) { setError(documentError(failure)); }
    finally { setLoading(false); }
  }, [company.id, id]);
  useEffect(() => { void load(); }, [load]);
  async function download() {
    if (!record) return;
    setBusy(true); setError("");
    try {
      const client = createClient(); if (!client) throw new Error();
      const result = await client.storage.from("contracts").download(record.storage_path);
      if (result.error) throw result.error;
      const href = URL.createObjectURL(result.data);
      const link = document.createElement("a"); link.href = href; link.download = record.filename; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 60000);
    } catch (failure) { setError(documentError(failure)); }
    finally { setBusy(false); }
  }
  async function recover() {
    setBusy(true); setError("");
    try {
      const client = createClient(); if (!client) throw new Error();
      const result = await client.rpc("contract_finish", { contract_id: id });
      if (result.error) throw result.error;
      await load();
    } catch (failure) { setError(documentError(failure)); }
    finally { setBusy(false); }
  }
  return <>
    <Link className="team-back" href="/contracts">← Todos os contratos</Link>
    {error && <p role="alert" className="workspace-error">{error}</p>}
    {loading ? <p role="status">A carregar contrato…</p> : !record ? <section className="card team-panel"><h2>Contrato indisponível</h2><p>Este contrato não existe na empresa seleccionada ou a sua conta não tem acesso.</p><button className="btn btn-secondary" onClick={load}>Tentar novamente</button></section> : <>
      <section className="card team-panel"><h2 className="team-email">{record.filename}</h2><p className="team-muted">{fileSize(record.byte_size)} · Registado em {new Date(record.created_at).toLocaleString("pt-PT")}</p><p><span className="team-badge">{contractStatus(record.status)}</span></p><p>Empresa: <strong>{company.name}</strong></p>
        {record.status === "uploaded" && <button className="btn btn-primary" disabled={busy} onClick={download}>{busy ? "A descarregar…" : "Descarregar documento"}</button>}
        {record.status === "uploading" && <><p>O envio não foi confirmado. Se o ficheiro já terminou de carregar, pode recuperar a confirmação.</p><button className="btn btn-secondary" disabled={busy} onClick={recover}>{busy ? "A verificar…" : "Verificar ficheiro guardado"}</button></>}
      </section>
      {record.status === "uploading" && <ContractUpload company={company} existing={record} onSaved={() => void load()}/>}
      {record.status === "uploaded" && <ContractAnalysis key={record.id} contract={record}/>}
    </>}
  </>;
}
