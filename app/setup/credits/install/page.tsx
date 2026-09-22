import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import Link from 'next/link';
import {AppShell} from '@/components/app-shell';
import {ServicesSetup} from '@/components/services-setup';
import {createClient} from '@/lib/supabase/server';
import {isBillingTester} from '@/lib/billing';
export const dynamic='force-dynamic';
export const metadata={title:'Preparar carteira | LIC',robots:{index:false,follow:false}};
export default async function Page(){
 const client=await createClient();const user=(await client?.auth.getUser())?.data.user;
 if(!user?.email_confirmed_at||!isBillingTester(user.email,(process.env.BILLING_TEST_EMAIL||'').trim().toLowerCase()))return <AppShell><h1>Configuração reservada</h1><Link href="/login?next=/setup/credits/install">Entrar</Link></AppShell>;
 const sql=readFileSync(join(process.cwd(),'supabase/migrations/012_prepaid_test.sql'),'utf8');
 return <AppShell><h1>Preparar carteira de teste</h1><p>Uma única actualização no SQL Editor do Supabase. Exige as actualizações 001, 002 e 006 já instaladas. Pode ser repetida, conserva o saldo e não activa dinheiro real ou IA paga.</p><ServicesSetup sql={sql}/>
 <h2>Notificações automáticas da Stripe</h2><p>Na Stripe de teste, crie um destino para <code>https://legal-intelligence-company.vercel.app/api/credits/webhook</code>. Não substitua o destino antigo de pagamentos.</p>
 <p>Eventos: checkout.session.completed, checkout.session.async_payment_succeeded, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed, charge.refunded e charge.dispute.created.</p>
 <p>Guarde o segredo deste novo destino na Vercel como <code>STRIPE_CREDITS_WEBHOOK_SECRET</code> e publique novamente. Não envie o segredo nesta conversa. O retorno do checkout também confirma o pagamento, sem creditar duas vezes.</p>
 <Link className="btn btn-primary" href="/setup/credits">Abrir carteira de teste</Link></AppShell>;
}
