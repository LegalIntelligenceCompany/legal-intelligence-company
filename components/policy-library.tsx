"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { documentError, type Policy } from "@/lib/documents";
import type { Company } from "./company-workspace";

export function PolicyLibrary({ company }: { company: Company }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Policy | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const client = createClient(); if (!client) throw new Error();
      const result = await client.from("policies").select("id,organization_id,title,content,created_at,updated_at,archived_at").eq("organization_id", company.id).order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      setPolicies(result.data ?? []);
    } catch (failure) { setError(documentError(failure)); }
    finally { setLoading(false); }
  }, [company.id]);
  useEffect(() => { void load(); }, [load]);

  function edit(policy: Policy | "new") {
    setEditing(policy); setTitle(policy === "new" ? "" : policy.title); setContent(policy === "new" ? "" : policy.content); setNotice(""); setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (title.trim().length < 2 || content.trim().length < 10) throw new Error("INVALID_POLICY");
      const client = createClient(); if (!client) throw new Error();
      const payload = { title: title.trim(), content: content.trim() };
      const result = editing === "new"
        ? await client.from("policies").insert({ ...payload, organization_id: company.id }).select("id")
        : await client.from("policies").update(payload).eq("organization_id", company.id).eq("id", editing!.id).eq("updated_at", editing!.updated_at).select("id");
      if (result.error) throw result.error;
      if (!result.data?.length) { setError("Esta política foi alterada por outra pessoa. Guarde uma cópia do texto, cancele e actualize a lista antes de editar novamente."); return; }
      setEditing(null); await load(); setNotice("Política guardada na empresa " + company.name + ".");
    } catch (failure) { setError(documentError(failure)); }
    finally { setBusy(false); }
  }
  async function archive(policy: Policy) {
    setBusy(true); setError(""); setNotice("");
    try {
      const client = createClient(); if (!client) throw new Error();
      const result = await client.from("policies").update({ archived_at: policy.archived_at ? null : new Date().toISOString() }).eq("organization_id", company.id).eq("id", policy.id).eq("updated_at", policy.updated_at).select("id");
      if (result.error) throw result.error;
      if (!result.data?.length) { setError("A política mudou. Actualize a lista antes de tentar novamente."); return; }
      setConfirmArchive(null); await load(); setNotice(policy.archived_at ? "Política reactivada." : "Política arquivada. Pode recuperá-la em Arquivadas.");
    } catch (failure) { setError(documentError(failure)); }
    finally { setBusy(false); }
  }
  const visible = policies.filter(policy => Boolean(policy.archived_at) === showArchived && `${policy.title} ${policy.content}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <>
    <div className="workspace-toolbar"><button className="btn btn-primary" disabled={busy || loading || editing !== null} onClick={() => edit("new")}>+ Nova política</button><button className="btn btn-secondary" disabled={busy || editing !== null} onClick={load}>Actualizar lista</button></div>
    {notice && <p className="team-notice" role="status">{notice}</p>}{error && <p className="workspace-error" role="alert">{error}</p>}
    {editing && <section className="card team-panel"><h2>{editing === "new" ? "Nova política" : "Editar política"}</h2><form onSubmit={save}>
      <label htmlFor="policy-title">Título</label><input id="policy-title" required minLength={2} maxLength={160} value={title} onChange={event => setTitle(event.target.value)} disabled={busy} placeholder="Por exemplo: Condições de pagamento"/>
      <label htmlFor="policy-content">Regras da empresa</label><textarea id="policy-content" required minLength={10} maxLength={100000} rows={10} value={content} onChange={event => setContent(event.target.value)} disabled={busy} placeholder="Descreva aqui as condições que os contratos devem cumprir."/>
      <p className="team-muted">Estas regras serão usadas quando a análise com IA for activada.</p><div className="workspace-toolbar"><button className="btn btn-primary" disabled={busy} type="submit">{busy ? "A guardar…" : "Guardar política"}</button><button className="btn btn-secondary" disabled={busy} type="button" onClick={() => setEditing(null)}>Cancelar</button></div>
    </form></section>}
    <section className="card team-panel"><div className="workspace-toolbar"><label htmlFor="policy-search">Pesquisar políticas</label><input id="policy-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Título ou conteúdo"/><button className="btn btn-secondary" aria-pressed={showArchived} onClick={() => setShowArchived(value => !value)}>{showArchived ? "Mostrar activas" : "Mostrar arquivadas"}</button></div>
      {loading ? <p role="status">A carregar políticas…</p> : !visible.length ? <p className="team-muted">{query ? "Nenhuma política corresponde à pesquisa." : showArchived ? "Não existem políticas arquivadas." : "Ainda não há políticas. Crie a primeira para definir as regras da sua empresa."}</p> : visible.map(policy => <article key={policy.id} className="workspace-row"><div><h3>{policy.title}</h3><p className="team-muted">Actualizada em {new Date(policy.updated_at).toLocaleString("pt-PT")}</p><details><summary>Ler política</summary><p className="policy-text">{policy.content}</p></details></div><div className="workspace-toolbar"><button className="btn btn-secondary" disabled={busy || editing !== null} onClick={() => edit(policy)}>Editar</button><button className="btn btn-secondary" disabled={busy || editing !== null} onClick={() => policy.archived_at ? void archive(policy) : setConfirmArchive(policy.id)}>{policy.archived_at ? "Reactivar" : "Arquivar"}</button></div>{confirmArchive === policy.id && <div className="team-notice"><p>Arquivar esta política? Ficará disponível na lista de arquivadas.</p><div className="workspace-toolbar"><button className="btn btn-secondary" disabled={busy} onClick={() => archive(policy)}>Confirmar arquivo</button><button className="btn btn-secondary" disabled={busy} onClick={() => setConfirmArchive(null)}>Cancelar</button></div></div>}</article>)}
    </section>
  </>;
}
