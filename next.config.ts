import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "r2.thesportsdb.com" },
      { protocol: "https", hostname: "a.espncdn.com" },
      { protocol: "https", hostname: "*.espncdn.com" },
      { protocol: "https", hostname: "secure.gravatar.com" }
    ]
  },
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "prisma"]
};

export default nextConfig;
