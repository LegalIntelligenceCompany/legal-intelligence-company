// Approved catalogue, not a billing entitlement. Production checkout stays off
// until the credit ledger, tax setup and company access have been validated.
// Access fees never fund inference. Keep this separate from Stripe price
// creation payloads so existing sandbox idempotency keys remain unchanged.
export const commercialConsumptionPolicy = {
  subscriptionPurpose: 'platform_access',
  includedAICredits: 0,
  consumptionPayment: 'prepaid_separately',
  providerCostMultiplier: 3.5,
  allowNegativeBalance: false,
  automaticTopUp: false,
  commercialInferenceEnabled: false,
} as const;
// Cost must already include all provider operations and be converted to EUR.
// Integer millionths avoid floating-point money errors. Round once per request,
// not once per model/tool. This calculator does not debit or authorise a wallet.
export function quoteAIConsumption(providerCostEuroMicros: number) {
  if (!Number.isSafeInteger(providerCostEuroMicros) || providerCostEuroMicros < 0) {
    throw Error('INVALID_PROVIDER_COST');
  }
  const markedUp = BigInt(providerCostEuroMicros) * BigInt(7);
  const customerBaseCents = Number((markedUp + BigInt(19999)) / BigInt(20000));
  return { providerCostEuroMicros, customerBaseCents, currency: 'eur' as const, taxIncluded: false as const };
}
export const commercialPlans = [
  { id: 'individual', name: 'LIC Individual', monthlyCents: 4900, seats: 1, scope: 'personal', lookupKey: 'lic_individual_monthly_eur_v1' },
  { id: 'business', name: 'LIC Empresas', monthlyCents: 9900, seats: 3, scope: 'organization', lookupKey: 'lic_business_monthly_eur_v1' },
] as const;
export type CommercialPlan = typeof commercialPlans[number];
export function getCommercialPlan(id: unknown): CommercialPlan {
  const plan = commercialPlans.find(p => p.id === id);
  if (!plan) throw Error('INVALID_PLAN');
  return plan;
}
export function testPlanPriceBody(plan: CommercialPlan) {
  // One price per company, NOT quantity=3. Seats share one future credit wallet.
  return new URLSearchParams({ currency: 'eur', unit_amount: String(plan.monthlyCents),
    'recurring[interval]': 'month', 'recurring[interval_count]': '1',
    'recurring[usage_type]': 'licensed', tax_behavior: 'exclusive',
    lookup_key: plan.lookupKey, 'product_data[name]': plan.name,
    'product_data[metadata][lic_plan]': plan.id,
    'metadata[lic_plan]': plan.id, 'metadata[lic_seats]': String(plan.seats),
    'metadata[lic_scope]': plan.scope, 'metadata[lic_release]': 'prelaunch',
  });
}
export function validateTestPlanPrice(raw: Record<string, unknown>, plan: CommercialPlan) {
  const recurring = raw.recurring as Record<string, unknown> | null;
  const metadata = raw.metadata as Record<string, unknown> | null;
  if (typeof raw.id !== 'string' || !/^price_[A-Za-z0-9]+$/.test(raw.id) ||
      raw.livemode !== false || raw.active !== true || raw.currency !== 'eur' ||
      raw.unit_amount !== plan.monthlyCents || raw.billing_scheme !== 'per_unit' ||
      raw.tax_behavior !== 'exclusive' || raw.lookup_key !== plan.lookupKey ||
      recurring?.interval !== 'month' || recurring.interval_count !== 1 || recurring.usage_type !== 'licensed' ||
      metadata?.lic_plan !== plan.id || metadata.lic_seats !== String(plan.seats) || metadata.lic_scope !== plan.scope ||
      raw.transform_quantity != null || raw.custom_unit_amount != null) throw Error('PLAN_MISMATCH');
  return { planId: plan.id, priceId: raw.id, amount: plan.monthlyCents, seats: plan.seats, testOnly: true as const };
}
