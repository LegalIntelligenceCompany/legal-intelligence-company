import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { CommercialPlansPanel } from '@/components/commercial-plans-panel';
import { createClient } from '@/lib/supabase/server';
import { isBillingTester } from '@/lib/billing';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Preparar planos | Legal Intelligence Company', robots: { index: false, follow: false } };
export default async function Page() {
  const client = await createClient();
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!user?.email_confirmed_at || !isBillingTester(user.email, (process.env.BILLING_TEST_EMAIL || '').trim().toLowerCase())) return <AppShell><h1>Configuração reservada</h1><p>Entre com a conta de configuração para preparar os planos.</p><Link href="/login?next=/setup/plans">Entrar</Link></AppShell>;
  return <AppShell><div className="eyebrow">Planos aprovados · pré-lançamento</div><h1 className="workspace-title">Individual e Empresas</h1><CommercialPlansPanel/></AppShell>;
}
