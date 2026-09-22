import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { PrepaidPanel } from '@/components/prepaid-panel';
import { createClient } from '@/lib/supabase/server';
import { isBillingTester } from '@/lib/billing';
export const dynamic='force-dynamic';
export const metadata={title:'Carteira de teste | LIC',robots:{index:false,follow:false}};
export default async function Page(){
 const client=await createClient();const user=(await client?.auth.getUser())?.data.user;
 if(!user?.email_confirmed_at||!isBillingTester(user.email,(process.env.BILLING_TEST_EMAIL||'').trim().toLowerCase()))return <AppShell><h1>Configuração reservada</h1><Link href="/login?next=/setup/credits">Entrar</Link></AppShell>;
 const teams=await client!.rpc('team_state');
 return <AppShell><div className="eyebrow">Pagamentos e consumo · sandbox</div><h1 className="workspace-title">Carteira pré-paga</h1><PrepaidPanel teams={teams.error?[]:teams.data||[]}/></AppShell>;
}
