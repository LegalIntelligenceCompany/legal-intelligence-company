// Sandbox purchases can never unlock real inference, even if the execution
// switch is accidentally enabled. Live entitlements are not implemented yet.
export function paidAIAccessError(): string {
  return "BILLING_TEST_ONLY";
}
