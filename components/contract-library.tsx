"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { documentError, contractStatus, fileSize, type Contract } from "@/lib/documents";
import type { Company } from "./company-workspace";

export function ContractLibrary({ company }: { company: Company }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const client = createClient(); if (!client) throw new Error();
      const result = await client.from("contracts").select("*").eq("organization_id", company.id).order("created_at", { ascending: false });
      if (result.error) throw result.error;
      setContracts(result.data ?? []);
    } catch (failure) { setError(documentError(failure)); }
    finally { setLoading(false); }
  }, [company.id]);
  useEffect(() => { void load(); }, [load]);
  const visible = contracts.filter(contract => contract.filename.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <>
    <div className="workspace-toolbar"><Link className="btn btn-primary" href="/contracts/new">+ Carregar contrato</Link><button className="btn btn-secondary" disabled={loading} onClick={load}>Actualizar lista</button></div>
    {error && <p className="workspace-error" role="alert">{error}</p>}
    <section className="card team-panel"><label htmlFor="contract-search">Pesquisar contratos</label><input id="contract-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome do ficheiro"/>
      {loading ? <p role="status">A carregar contratos…</p> : !visible.length ? <p className="team-muted">{query ? "Nenhum contrato corresponde à pesquisa." : "Ainda não existem contratos nesta empresa. Carregue o primeiro documento."}</p> : <ul className="team-list">{visible.map(contract => <li key={contract.id}><div className="team-email"><Link href={`/contracts/${contract.id}`}><strong>{contract.filename}</strong></Link><p className="team-muted">{fileSize(contract.byte_size)} · {new Date(contract.created_at).toLocaleDateString("pt-PT")}</p></div><div className="workspace-toolbar"><span className="team-badge">{contractStatus(contract.status)}</span><Link className="btn btn-secondary" href={`/contracts/${contract.id}`}>Abrir</Link></div></li>)}</ul>}
    </section>
  </>;
}
