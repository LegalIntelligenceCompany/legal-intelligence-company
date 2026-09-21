import "server-only";
import { createClient } from "@supabase/supabase-js";

// Import only from server routes. Never forward this client, key or raw errors to the browser.
export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("SERVER_ONLY");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
