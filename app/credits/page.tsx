import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {LiveCreditsPanel} from '@/components/live-credits-panel';
import {createClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export const metadata={title:'Planos e créditos | LIC',robots:{index:false,follow:false}};
export default async function Page(){
 const client=await createClient();const user=(await client?.auth.getUser())?.data.user;
 return <AppShell><div className="eyebrow">Acesso e consumo separados</div><h1>Planos e créditos</h1>{user?.email_confirmed_at?<LiveCreditsPanel/>:<Link className="btn btn-primary" href="/login?next=/credits">Entrar para gerir créditos</Link>}</AppShell>;
}
