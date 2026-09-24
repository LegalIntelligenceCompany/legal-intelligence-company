import type { NextConfig } from "next";

// Keep validation builds separate from a running development server.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {return [{source:'/:path*',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Content-Security-Policy',value:"frame-ancestors 'none'; object-src 'none'; base-uri 'self'"},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'Permissions-Policy',value:'camera=(), geolocation=(), microphone=(self)'},
  ]}];},
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  // Setup pages read SQL at runtime. Include every migration explicitly: the
  // automatic tracer can omit a read when several files are concatenated.
  outputFileTracingIncludes: {
    "/setup/*": ["./supabase/migrations/*.sql"],
  },
};
export default nextConfig;
