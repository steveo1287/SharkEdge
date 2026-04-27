import type { NextConfig } from "next";

// Build timestamp: 2026-04-27T17:13:00Z - Force Vercel pickup of sim engine fixes
const BUILD_ID = "prod-2026-04-27-17-13-sim-engine-fixes";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "r2.thesportsdb.com"
      },
      {
        protocol: "https",
        hostname: "a.espncdn.com"
      },
      {
        protocol: "https",
        hostname: "*.espncdn.com"
      },
      {
        protocol: "https",
        hostname: "secure.gravatar.com"
      }
    ]
  },
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "prisma"],
  env: {
    BUILD_ID
  }
};

export default nextConfig;
