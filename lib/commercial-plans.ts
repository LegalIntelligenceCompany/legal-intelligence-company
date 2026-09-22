// Approved catalogue, not a billing entitlement. Production checkout stays off
// until the credit ledger, tax setup and company access have been validated.
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
