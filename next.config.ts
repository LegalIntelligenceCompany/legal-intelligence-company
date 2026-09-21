import type { NextConfig } from "next";

// Keep validation builds separate from a running development server.
const nextConfig: NextConfig = { reactStrictMode: true, distDir: process.env.NEXT_BUILD_DIR || ".next" };
export default nextConfig;
