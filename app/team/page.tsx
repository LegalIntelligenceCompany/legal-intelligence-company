"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/client";
import { readCompanySelection, saveCompanySelection } from "@/lib/company-selection";

type Member = { id: string; email: string; role: string };
type Invitation = { id: string; email: string; role: string; expires_at: string };
type Company = { id: string; name: string; role: string; members: Member[]; invitations: Invitation[] };
const roleNames: Record<string, string> = { owner: "Proprietário", admin: "Administrador", member: "Membro" };

function describeError(error: { message: string; code?: string }) {
  if (error.code === "PGRST202" || error.message.includes("schema cache")) return "A área de equipa ainda precisa de ser activada no Supabase. Execute a actualização 002_team.sql indicada no guia do projecto.";
  if (error.message.includes("ALREADY_MEMBER")) return "Esta pessoa já pertence à empresa.";
  if (error.message.includes("INVITE_EXISTS")) return "Já existe um convite activo para este e-mail. Se perdeu o link, revogue o convite e crie outro.";
  if (error.message.includes("INVALID_OR_EXPIRED_INVITE")) return "Este convite expirou, foi utilizado ou pertence a outro e-mail. Entre com o e-mail convidado ou peça um novo link.";
  if (error.message.includes("FORBIDDEN")) return "Não tem permissão para esta acção.";
  if (error.message.includes("INVITE_LIMIT")) return "A empresa atingiu o limite de 50 convites pendentes.";
  if (error.message.includes("ALREADY_OWNER")) return "Já criou uma empresa. Actualize a página para a seleccionar.";
  return "Não foi possível concluir. Verifique a ligação e tente novamente.";
}

export default function Team() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState("");
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviteLink, setInviteLink] = useState("");
  const [token, setToken] = useState("");
  const company = companies.find(item => item.id === selected) ?? companies[0];
  const canManage = company?.role === "owner" || company?.role === "admin";

  const refresh = useCallback(async () => {
    try {
      const client = createClient();
      if (!client) { setPhase("setup"); return; }
      const { data: { user } } = await client.auth.getUser();
      if (!user) { setPhase("login"); return; }
      const { data, error } = await client.rpc("team_state");
      if (error) { setMessage(describeError(error)); setPhase("error"); return; }
      setCompanies(data ?? []);
      setPhase("ready");
    } catch { setPhase("error"); setMessage("Não foi possível carregar a equipa. Verifique a ligação e tente novamente."); }
  }, []);

  useEffect(() => {
    // O fragmento não é enviado ao servidor nem incluído no referer.
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "");
    setSelected(readCompanySelection());
    void refresh();
  }, [refresh]);

  async function perform(operation: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await operation(); } catch { setMessage("A ligação falhou. Tente novamente."); }
    finally { setBusy(false); }
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const client = createClient(); if (!client) return;
      const { data, error } = await client.rpc("team_create_organization", { company_name: companyName });
      if (error) { setMessage(describeError(error)); return; }
      setSelected(data); saveCompanySelection(data); await refresh(); setMessage("Empresa criada. Já pode convidar a sua equipa.");
    });
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!company) return;
    await perform(async () => {
      const client = createClient(); if (!client) return;
      setInviteLink("");
      const { data, error } = await client.rpc("team_invite", { org_id: company.id, invite_email: email.trim(), invite_role: company.role === "owner" ? role : "member" });
      if (error) { setMessage(describeError(error)); return; }
      setInviteLink(`${window.location.origin}/team#invite=${encodeURIComponent(data)}`);
      setEmail(""); await refresh(); setMessage("Convite criado. Copie o link e envie-o à pessoa convidada. Não foi enviado nenhum e-mail automaticamente.");
    });
  }

  async function accept() {
    await perform(async () => {
      const client = createClient(); if (!client) return;
      const { data, error } = await client.rpc("team_accept", { invite_token: token });
      if (error) { setMessage(describeError(error)); return; }
      setToken(""); window.history.replaceState(null, "", "/team");
      setSelected(data); saveCompanySelection(data); await refresh(); setMessage("Convite aceite. Já pertence à equipa.");
    });
  }

  async function revoke(id: string) {
    await perform(async () => {
      const client = createClient(); if (!client) return;
      const { error } = await client.rpc("team_revoke", { invitation_id: id });
      if (error) { setMessage(describeError(error)); return; }
      setInviteLink(""); await refresh(); setMessage("Convite revogado. O link deixou de dar acesso.");
    });
  }

  return <AppShell>
    <Link href="/dashboard" className="team-back">← Visão geral</Link>
    <div className="eyebrow">Pessoas e permissões</div>
    <h1 style={{ fontSize: 29, margin: "6px 0" }}>Equipa</h1>
    <p className="team-muted">Trabalhe com outras pessoas da sua empresa num espaço partilhado.</p>
    {message && <p className="team-notice" role="status">{message}</p>}
    {phase === "loading" && <p role="status">A carregar a equipa…</p>}
    {phase === "login" && <section className="card team-panel"><h2>Entre para gerir a equipa</h2><p>Esta área usa a sua conta e as empresas a que pertence.</p>{token && <p>Entre com o e-mail que recebeu o convite e volte a abrir este mesmo link para o aceitar.</p>}<Link className="btn btn-primary" href="/login">Entrar na minha conta</Link></section>}
    {phase === "setup" && <section className="card team-panel"><h2>Ligação necessária</h2><p>Configure o Supabase e execute a actualização 002_team.sql para activar membros e convites.</p></section>}
    {phase === "error" && <button className="btn btn-secondary" onClick={() => { setMessage(""); void refresh(); }}>Tentar novamente</button>}
    {phase === "ready" && <>
      {token && <section className="card team-panel"><h2>Convite para uma equipa</h2><p>Aceite para partilhar o acesso à empresa com a conta em que está autenticado. O e-mail tem de corresponder ao convite.</p><button disabled={busy} className="btn btn-primary" onClick={accept}>Aceitar convite</button></section>}
      {!companies.length && !token && <section className="card team-panel"><h2>Crie o espaço da sua empresa</h2><p>Ainda não pertence a nenhuma equipa. Crie uma empresa ou abra um convite recebido.</p><form onSubmit={createCompany}><label htmlFor="company-name">Nome da empresa</label><input id="company-name" required minLength={2} maxLength={120} value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="Nome da sua empresa"/><button disabled={busy} className="btn btn-primary" type="submit">{busy ? "A criar…" : "Criar empresa"}</button></form></section>}
      {company && <>
        <div className="team-company"><label htmlFor="team-company">Empresa</label><select id="team-company" value={company.id} onChange={event => { setSelected(event.target.value); saveCompanySelection(event.target.value); setInviteLink(""); setRole("member"); setMessage(""); }}>{companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="team-badge">{roleNames[company.role]}</span></div>
        <div className="team-columns">
          <section className="card team-panel"><h2>Membros <span className="team-muted">({company.members.length})</span></h2><ul className="team-list">{company.members.map(member => <li key={member.id}><span className="team-email">{member.email}</span><span className="team-badge">{roleNames[member.role]}</span></li>)}</ul></section>
          <section className="card team-panel"><h2>Convidar uma pessoa</h2>{canManage ? <form onSubmit={invite}><label htmlFor="invite-email">E-mail profissional</label><input id="invite-email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="colega@empresa.pt"/><label htmlFor="invite-role">Perfil de acesso</label><select id="invite-role" value={role} onChange={event => setRole(event.target.value)}><option value="member">Membro</option>{company.role === "owner" && <option value="admin">Administrador</option>}</select><p className="team-muted">Os membros partilham contratos e políticas. Os administradores também podem convidar membros. Apenas o proprietário convida administradores.</p><button disabled={busy} className="btn btn-primary" type="submit">{busy ? "A processar…" : "Criar link de convite"}</button><p className="team-muted">Válido durante 7 dias, apenas para o e-mail indicado.</p></form> : <p>Apenas o proprietário e os administradores podem criar convites.</p>}
          {inviteLink && <div className="team-notice"><label htmlFor="invite-link">Link para partilhar</label><input id="invite-link" readOnly value={inviteLink} onFocus={event => event.target.select()}/><button className="btn btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(inviteLink); setMessage("Link copiado."); } catch { setMessage("Seleccione o link e copie-o manualmente."); } }}>Copiar link</button><p className="team-muted">Se o site estiver em localhost, o link só funciona neste computador. Publique o site antes de convidar pessoas noutros computadores.</p></div>}
          </section>
        </div>
        {canManage && <section className="card team-panel"><h2>Convites pendentes</h2>{company.invitations.length ? <ul className="team-list">{company.invitations.map(invitation => <li key={invitation.id}><div className="team-email">{invitation.email}<small className="team-muted" style={{ display: "block", marginTop: 5 }}>{roleNames[invitation.role]} · Expira a {new Date(invitation.expires_at).toLocaleDateString("pt-PT")}</small></div>{(company.role === "owner" || invitation.role === "member") && <button className="btn btn-secondary" disabled={busy} onClick={() => revoke(invitation.id)}>Revogar</button>}</li>)}</ul> : <p className="team-muted">Ainda não existem convites pendentes.</p>}</section>}
      </>}
    </>}
  </AppShell>;
}
