"use client";
import { useEffect, useState } from "react";
import { MarketingNav } from "@/components/marketing-nav";
import { createClient } from "@/lib/supabase/client";
import {loginDestination} from '@/lib/login-destination';

const errors: Record<string, string> = {
  login: "Não foi possível concluir a entrada. O link pode ter expirado, já ter sido utilizado ou ter sido aberto num navegador diferente.",
  invalid_link: "O site recebeu um link sem o código necessário para entrar. É preciso verificar a configuração do link no Supabase.",
  connection: "O site não conseguiu contactar o serviço de autenticação. A entrada não foi concluída.",
  configuration: "A autenticação não está configurada neste ambiente. Contacte o administrador.",
};
export default function Login() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setMessage(errors[code] ?? errors.login);
    if (window.location.hash.includes("error=")) setMessage(errors.login);
  }, []);
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); if (loading) return;
    const supabase = createClient();
    if (!supabase) { setMessage(errors.configuration); return; }
    setLoading(true); setMessage("");
    const next = new URLSearchParams(window.location.search).get("next");
    document.cookie = `lic_return=${encodeURIComponent(loginDestination(next))}; Path=/; Max-Age=900; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      setMessage(error ? "Não foi possível enviar o e-mail. Verifique o endereço; se o problema persistir, o administrador deve consultar os registos de autenticação." : "E-mail enviado. A sessão só fica iniciada depois de abrir o link, neste mesmo navegador.");
    } catch { setMessage(errors.connection); }
    finally { setLoading(false); }
  }
  return <><MarketingNav/><main className="shell" style={{ maxWidth: 540, paddingTop: 50, paddingBottom: 50 }}><section className="card" style={{ padding: 32 }}>
    <div className="eyebrow">Acesso seguro</div><h1 style={{ margin: "10px 0", fontSize: 28 }}>Entre na sua conta</h1>
    <p>Actualmente, a entrada é feita por link de e-mail. Não precisa de ter uma empresa.</p>
    {message && <p role="status" className="team-notice">{message}</p>}
    <form onSubmit={signIn} className="team-panel" style={{ padding: 0 }}>
      <label htmlFor="login-email">E-mail</label><input id="login-email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="nome@exemplo.pt" disabled={loading}/>
      <button disabled={loading} className="btn btn-primary" style={{ width: "100%" }}>{loading ? "A enviar…" : "Enviar link de acesso"}</button>
    </form>
    <p className="assistant-small">Não volte a pedir e-mails se o link anterior não abrir. Primeiro confirme se o endereço de destino é o site publicado e não localhost. Não partilhe o link completo: contém um código privado.</p>
    <a href="/chat" className="btn btn-secondary">Voltar ao chat jurídico</a>
  </section></main></>;
}
