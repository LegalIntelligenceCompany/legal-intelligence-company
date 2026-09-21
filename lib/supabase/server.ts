import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Only create a client when credentials exist. This makes the local demo safe to run.
export async function createClient(writableCookies = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Route handlers may persist a refreshed session; Server Components stay read-only.
      setAll: (values: { name: string; value: string; options: CookieOptions }[]) => { if (writableCookies) values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
    },
  });
}
