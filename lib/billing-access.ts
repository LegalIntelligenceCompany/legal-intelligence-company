// Sandbox purchases can never unlock real inference, even if the execution
// switch is accidentally enabled. Commercial research uses its separate
// live subscription + prepaid reservation gate. Other services use service-funding.
import { pilotEnabled, pilotAccount, PILOT_EXPIRES } from './ai-pilot';
export function paidAIAccessError(user?: { email?: string; email_confirmed_at?: string | null } | null): string {
  if (pilotEnabled() && pilotAccount(user)) return Date.now() > Date.parse(PILOT_EXPIRES) ? 'PILOT_EXPIRED' : '';
  return "BILLING_TEST_ONLY";
}
