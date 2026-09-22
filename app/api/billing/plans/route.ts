import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { billingConfig, isBillingTester, stripeTestRequest } from '@/lib/billing';
import { withBillingLock } from '@/lib/billing-store';
import { commercialPlans, commercialConsumptionPolicy, testPlanPriceBody, validateTestPlanPrice, type CommercialPlan } from '@/lib/commercial-plans';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };
async function owner() {
  const client = await createClient(true);
  const user = client ? (await client.auth.getUser()).data.user : null;
  if (!user) throw Error('UNAUTHORIZED');
  if (!user.email_confirmed_at || !isBillingTester(user.email, billingConfig().tester)) throw Error('FORBIDDEN');
  return user;
}
async function findPrice(plan: CommercialPlan) {
  // Include inactive prices as well: never silently replace a conflicting price.
  const query = new URLSearchParams({ 'lookup_keys[]': plan.lookupKey, limit: '2' });
  const list = await stripeTestRequest(`prices?${query}`);
  if (!Array.isArray(list.data) || list.has_more !== false || list.data.length > 1) throw Error('PLAN_MISMATCH');
  return list.data.length ? validateTestPlanPrice(list.data[0], plan) : null;
}
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : 'PROVIDER';
  const messages: Record<string, string> = {
    UNAUTHORIZED: 'Entre na conta de configuração.', FORBIDDEN: 'Apenas a conta de configuração pode preparar os planos.',
    PLAN_MISMATCH: 'Existe um preço incompatível na Stripe. Não foi alterado nem substituído.',
    NOT_CONFIGURED: 'Falta a configuração Stripe de teste no servidor. Chaves de produção não são aceites.',
    BUSY: 'Existe uma operação em curso. Actualize o estado antes de repetir.',
  };
  return NextResponse.json({ error: messages[code] || 'Não foi possível confirmar os planos. Consulte o estado antes de repetir.', code: code in messages ? code : 'PROVIDER' },
    { headers, status: code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'PLAN_MISMATCH' || code === 'BUSY' ? 409 : 503 });
}
export async function GET() {
  try {
    await owner();
    const plans = await Promise.all(commercialPlans.map(async plan => ({ ...plan, stripe: await findPrice(plan) })));
    return NextResponse.json({ plans, consumptionPolicy: commercialConsumptionPolicy, testOnly: true, commercialCheckoutEnabled: false }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw Error('FORBIDDEN');
    const user = await owner();
    // Existing per-owner DB lock prevents concurrent provisioning. Lookup keys
    // and stable Stripe idempotency keys also make interrupted retries safe.
    const plans = await withBillingLock(user.id, async () => {
      const results = [];
      for (const plan of commercialPlans) {
        let price = await findPrice(plan);
        if (!price) price = validateTestPlanPrice(await stripeTestRequest('prices', testPlanPriceBody(plan), `lic-catalogue-${plan.lookupKey}`), plan);
        results.push({ ...plan, stripe: price });
      }
      return results;
    });
    return NextResponse.json({ plans, consumptionPolicy: commercialConsumptionPolicy, testOnly: true, commercialCheckoutEnabled: false }, { headers });
  } catch (error) { return failure(error); }
}
