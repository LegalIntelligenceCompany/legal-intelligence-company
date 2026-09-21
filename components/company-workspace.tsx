"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { readCompanySelection, saveCompanySelection } from "@/lib/company-selection";
import { AppShell } from "./app-shell";

export type Company = { id: string; name: string; role: "owner" | "admin" | "member" };
export function CompanyWorkspace({ title, description, children }: { title: string; description: string; children: (company: Company) => ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState("");
  const [phase, setPhase] = useState("loading");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const client = createClient();
    if (!client) { setPhase("setup"); return; }
    async function load() {
      setPhase("loading");
      try {
        const { data, error } = await client!.auth.getUser();
        if (!active) return;
        if (error && !error.message.includes("Auth session missing")) { setPhase("error"); return; }
        if (!data.user) { setCompanies([]); setPhase("login"); return; }
        const result = await client!.from("organizations").select("id,name,organization_members!inner(role,user_id)").eq("organization_members.user_id", data.user.id).order("name");
        if (!active) return;
        if (result.error) { setPhase("error"); return; }
        const available = (result.data ?? []).map(item => ({ id: item.id as string, name: item.name as string, role: item.organization_members[0].role as Company["role"] }));
        const saved = readCompanySelection();
        const id = available.find(item => item.id === saved)?.id ?? available[0]?.id ?? "";
        setCompanies(available); setSelected(id); if (id) saveCompanySelection(id); setPhase("ready");
      } catch { if (active) setPhase("error"); }
    }
    void load();
    const { data: subscription } = client.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") { setCompanies([]); setPhase("login"); }
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, [revision]);
  const company = companies.find(item => item.id === selected);
  return <AppShell>
    <div className="eyebrow">Espaço da empresa</div><h1 className="workspace-title">{title}</h1><p className="team-muted">{description}</p>
    {phase === "loading" && <p role="status">A carregar…</p>}
    {phase === "login" && <section className="card team-panel"><h2>Entre na sua conta</h2><p>Os documentos são privados e pertencem à sua empresa.</p><Link href="/login" className="btn btn-primary">Entrar</Link></section>}
    {phase === "setup" && <p className="team-notice">Configure o Supabase para guardar dados reais.</p>}
    {phase === "error" && <section className="card team-panel"><p role="alert">Não foi possível carregar as empresas. Verifique a ligação e a configuração da conta.</p><button className="btn btn-secondary" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></section>}
    {phase === "ready" && !company && <section className="card team-panel"><h2>Primeiro, escolha uma equipa</h2><p>Crie a sua empresa ou aceite um convite para começar.</p><Link href="/team" className="btn btn-primary">Abrir Equipa</Link></section>}
    {phase === "ready" && company && <>
      <div className="team-company"><label htmlFor="workspace-company">Empresa activa</label><select id="workspace-company" value={selected} onChange={event => { setSelected(event.target.value); saveCompanySelection(event.target.value); }}>{companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div key={company.id}>{children(company)}</div>
    </>}
  </AppShell>;
}
