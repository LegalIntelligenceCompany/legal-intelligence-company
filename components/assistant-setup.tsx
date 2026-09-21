"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";
export function AssistantSetup({ sql }: { sql: string }) {
  const [message, setMessage] = useState("");
  return <AppShell><h1>Activar chat e ferramentas</h1><section className="card team-panel"><p>A actualização 005 cria limites de utilização protegidos no servidor. Não guarda perguntas nem documentos. As actualizações 001 a 004 devem estar instaladas para as ferramentas documentais.</p><ol><li>Copie o código abaixo.</li><li>No Supabase, abra SQL Editor → nova consulta (+).</li><li>Cole o código e clique em Run.</li><li>Depois de Success, volte ao chat. São utilizadas as chaves de servidor já configuradas para a análise.</li></ol><button className="btn btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(sql); setMessage("Código copiado."); } catch { setMessage("Seleccione o código abaixo e copie com ⌘ + C."); } }}>Copiar código SQL</button><p role="status">{message}</p><label htmlFor="assistant-sql">005_assistant.sql</label><textarea id="assistant-sql" readOnly rows={15} value={sql} onFocus={e => e.target.select()}/><Link className="btn btn-secondary" href="/chat">Abrir chat</Link></section></AppShell>;
}
