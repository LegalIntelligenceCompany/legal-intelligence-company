// Sandbox purchases can never unlock real inference, even if the execution
// switch is accidentally enabled. Live entitlements are not implemented yet.
import { pilotEnabled, pilotAccount, PILOT_EXPIRES } from './ai-pilot';
export function paidAIAccessError(user?: { email?: string; email_confirmed_at?: string | null } | null): string {
  if (pilotEnabled() && pilotAccount(user)) return Date.now() > Date.parse(PILOT_EXPIRES) ? 'PILOT_EXPIRED' : '';
  return "BILLING_TEST_ONLY";
}
