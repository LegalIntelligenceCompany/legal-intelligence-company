import Link from "next/link";
import { Icon } from "./icons";
import {Brand} from './brand';

const items = [
  ["/credits", "file", "Planos e créditos"],
  ["/usage", "shield", "Histórico de consumo"],
  ["/recoveries", "file", "Recuperar resultados"],
  ["/transcription", "file", "Transcrição de áudio"],
  ["/services", "file", "Serviços jurídicos"],
  ["/clauses", "file", "Cláusulas"],
  ["/library", "file", "Dossiers"],
  ["/alerts", "file", "Temas legislativos"],
  ["/chat", "file", "Chat jurídico"],
  ["/dashboard", "home", "Visão geral"],
  ["/tools", "file", "Ferramentas"],
  ["/contracts", "file", "Contratos"],
  ["/policies", "shield", "Políticas"],
  ["/company", "building", "Empresa"],
  ["/team", "building", "Equipa"],
  ["/settings", "settings", "A minha conta"],
  ["/help", "file", "Ajuda"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return <>
    <aside className="app-sidebar" style={{ width:244, position:"fixed", inset:"0 auto 0 0", background:"#112b4b", padding:"25px 14px", display:"flex", flexDirection:"column", zIndex:2 }}>
      <Link href="/dashboard" className="sidebar-brand" aria-label="Legal Intelligence Company — painel"><Brand compact/></Link>
      <nav aria-label="Menu principal" style={{overflowY:'auto',minHeight:0}}>{items.map(([href, icon, label]) => <Link key={href} className="side-link" href={href}><Icon name={icon}/>{label}</Link>)}</nav>
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
