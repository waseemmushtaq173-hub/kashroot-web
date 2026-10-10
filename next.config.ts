import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Old pages that called a separate backend (never deployed) now point at
  // the shared marketplace that works.
  async redirects() {
    return [
      { source: '/farmer/listings/new', destination: '/farmer/dashboard?tab=lots&add=1', permanent: false },
      { source: '/farmer/listings/:id/edit', destination: '/farmer/dashboard?tab=lots', permanent: false },
      { source: '/buyer/discover', destination: '/compare-prices?category=produce', permanent: false },
      { source: '/buyer/checkout/:id', destination: '/compare-prices?category=produce', permanent: false },
    ];
  },
};

export default nextConfig;
