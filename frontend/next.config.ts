import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "r2.thesportsdb.com"
      },
      {
        protocol: "https",
        hostname: "a.espncdn.com"
      }
    ]
  }
};

export default nextConfig;
