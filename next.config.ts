import type { NextConfig } from "next";

// Build timestamp: 2026-04-18T14:12:00Z - Forces production rebuild with new board design
const BUILD_ID = "prod-2026-04-18-14-12-new-board-design";

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
