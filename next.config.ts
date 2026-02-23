import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow external images for favicons
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'pinholaw.com' },
    ],
  },
  // Suppress specific warnings
  typescript: {
    ignoreBuildErrors: false,
  },
  serverExternalPackages: ['googleapis'],
};

export default nextConfig;
