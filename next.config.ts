import type { NextConfig } from "next";

// Keep validation builds separate from a running development server.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  // Setup pages read SQL at runtime. Include every migration explicitly: the
  // automatic tracer can omit a read when several files are concatenated.
  outputFileTracingIncludes: {
    "/setup/*": ["./supabase/migrations/*.sql"],
  },
};
export default nextConfig;
