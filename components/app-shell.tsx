import Link from "next/link";
import { Icon } from "./icons";

const items = [
  ["/transcription", "file", "Transcrição de áudio"],
  ["/services", "file", "Serviços jurídicos"],
  ["/library", "file", "Dossiers"],
  ["/alerts", "file", "Alertas legislativos"],
  ["/chat", "file", "Chat jurídico"],
  ["/dashboard", "home", "Visão geral"],
  ["/tools", "file", "Ferramentas"],
  ["/contracts", "file", "Contratos"],
  ["/policies", "shield", "Políticas"],
  ["/company", "building", "Empresa"],
  ["/team", "building", "Equipa"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return <>
    <aside className="app-sidebar" style={{ width:244, position:"fixed", inset:"0 auto 0 0", background:"#112b4b", padding:"25px 14px", display:"flex", flexDirection:"column", zIndex:2 }}>
      <Link href="/dashboard" style={{ color:"white", fontSize:18, fontWeight:800, lineHeight:1.1, padding:"0 12px 30px" }}>Legal Intelligence<br/>Company<span style={{color:"#63a4ff"}}>.</span></Link>
      <nav aria-label="Menu principal">{items.map(([href, icon, label]) => <Link key={href} className="side-link" href={href}><Icon name={icon}/>{label}</Link>)}</nav>
      <div style={{ marginTop:"auto", borderTop:"1px solid #ffffff1c", paddingTop:14 }}>
        <Link href="/settings" className="side-link"><Icon name="settings"/>Definições</Link>
      </div>
    </aside>
    <main className="app-main" style={{ marginLeft:244, padding:"35px 44px", minHeight:"100vh" }}>
      <nav className="mobile-app-nav" aria-label="Menu móvel">{items.map(([href, , label]) => <Link key={href} className="btn btn-secondary" href={href}>{label}</Link>)}</nav>
      {children}
    </main>
  </>;
}
