import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {loginDestination} from '@/lib/login-destination';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.redirect(`${origin}/login?error=configuration`);
  if (!code) return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  const cookieStore = await cookies();
  const returnTo = cookieStore.get("lic_return")?.value;
  let decoded='';try{decoded=decodeURIComponent(returnTo||'');}catch{/* Invalid cookie fails closed. */}
  const destination = loginDestination(decoded==='chat'?'/chat':decoded==='billing'?'/billing':decoded);
  const response = NextResponse.redirect(`${origin}${destination}`);
  response.cookies.set("lic_return", "", { path: "/", maxAge: 0 });
  const deadline = AbortSignal.timeout(12000);
  const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: deadline });
  const supabase = createServerClient(url, key, { global: { fetch: timedFetch }, cookies: { getAll: () => cookieStore.getAll(), setAll: (items: { name: string; value: string; options: CookieOptions }[]) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login?error=${deadline.aborted ? "connection" : "login"}`);
    return response;
  } catch { return NextResponse.redirect(`${origin}/login?error=connection`); }
}
