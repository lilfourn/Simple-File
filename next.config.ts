import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb', // Increase limit to 50MB
    },
  },
};

export default nextConfig;
