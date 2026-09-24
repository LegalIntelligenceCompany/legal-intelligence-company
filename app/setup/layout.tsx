import {isSiteOwner} from '@/lib/site-owner';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function SetupLayout({children}:{children:React.ReactNode}) {
 if(!await isSiteOwner())return <main className="shell"><h1>Área reservada ao administrador</h1><p>As instruções de instalação não fazem parte da conta do cliente.</p><Link className="btn btn-primary" href="/login?next=/settings">Entrar</Link> <Link href="/">Voltar ao início</Link></main>;
 return children;
}
