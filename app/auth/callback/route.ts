import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!code || !url || !key) return NextResponse.redirect(`${origin}/login?error=login`);
  const cookieStore = await cookies();
  const destination = cookieStore.get("lic_return")?.value === "chat" ? "/chat" : "/dashboard";
  const response = NextResponse.redirect(`${origin}${destination}`);
  response.cookies.set("lic_return", "", { path: "/", maxAge: 0 });
  const supabase = createServerClient(url, key, { cookies: { getAll: () => cookieStore.getAll(), setAll: (items: { name: string; value: string; options: CookieOptions }[]) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=login`);
  return response;
}
