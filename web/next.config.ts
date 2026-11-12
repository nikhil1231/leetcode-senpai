import type { NextConfig } from "next";

// The FastAPI server owns /api; the browser only ever talks to this origin. Cloudflare Access (or local mode)
// authenticates at the edge, and the rewrite forwards its headers and cookie untouched.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],   // dev server reached by IP (screenshots, phone on the LAN would add its own)
  skipTrailingSlashRedirect: true,
  experimental: { proxyTimeout: 180_000 },   // model-graded calls can take a while
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default config;
