"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { documentError, contractStatus, type Contract } from "@/lib/documents";
import type { Company } from "./company-workspace";

export function CompanyDashboard({ company }: { company: Company }) {
  const [summary, setSummary] = useState<{ total: number; uploaded: number; policies: number; contracts: Contract[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const client = createClient(); if (!client) throw new Error();
        const [total, uploaded, policies, recent] = await Promise.all([
          client.from("contracts").select("id", { count: "exact", head: true }).eq("organization_id", company.id),
          client.from("contracts").select("id", { count: "exact", head: true }).eq("organization_id", company.id).eq("status", "uploaded"),
          client.from("policies").select("id", { count: "exact", head: true }).eq("organization_id", company.id).is("archived_at", null),
          client.from("contracts").select("*").eq("organization_id", company.id).order("created_at", { ascending: false }).limit(5),
        ]);
        const failure = [total, uploaded, policies, recent].find(result => result.error)?.error;
        if (failure) throw failure;
        if (active) setSummary({ total: total.count ?? 0, uploaded: uploaded.count ?? 0, policies: policies.count ?? 0, contracts: recent.data ?? [] });
      } catch (failure) { if (active) setError(documentError(failure)); }
    }
    void load(); return () => { active = false; };
  }, [company.id]);
  return <>
    <div className="workspace-toolbar"><Link className="btn btn-primary" href="/contracts/new">+ Novo contrato</Link><Link className="btn btn-secondary" href="/policies">Gerir políticas</Link></div>
    {error ? <p className="workspace-error" role="alert">{error}</p> : !summary ? <p role="status">A carregar actividade…</p> : <>
      <div className="dash-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 24 }}><div className="card stat"><span>Contratos registados</span><strong>{summary.total}</strong></div><div className="card stat"><span>Ficheiros guardados</span><strong>{summary.uploaded}</strong><small>Sem análise automática</small></div><div className="card stat"><span>Políticas activas</span><strong>{summary.policies}</strong></div></div>
      <section className="card team-panel"><h2>Contratos recentes</h2>{!summary.contracts.length ? <p className="team-muted">Ainda não foram carregados contratos nesta empresa.</p> : <ul className="team-list">{summary.contracts.map(contract => <li key={contract.id}><Link className="team-email" href={`/contracts/${contract.id}`}><strong>{contract.filename}</strong></Link><span className="team-badge">{contractStatus(contract.status)}</span></li>)}</ul>}</section>
    </>}
  </>;
}
