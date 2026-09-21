import Link from "next/link";
export function MarketingNav() {
  return <nav className="shell marketing-nav" aria-label="Navegação principal"><Link className="marketing-brand" href="/">Legal Intelligence Company<span>.</span></Link><div className="marketing-links"><Link href="/#como-funciona">Serviços</Link><Link href="/#seguranca">Segurança</Link></div><div className="workspace-toolbar"><Link href="/login" className="btn btn-secondary">Entrar</Link><Link href="/chat" className="btn btn-primary">Chat jurídico</Link></div></nav>;
}
