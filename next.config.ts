import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Styles go inside each page instead of a separate file. On slow village
  // networks (or when a phone holds an old copy of a page) a separate style
  // file can fail to arrive, and the page then shows as plain unstyled text.
  // Inline styles always arrive with the page, and save a round trip on 2G/3G.
  experimental: {
    inlineCss: true,
  },
  // Old pages that called a separate backend (never deployed) now point at
  // the shared marketplace that works.
  // Security headers on every response. The CSP part only blocks what
  // KashRoot never needs (being framed by other sites, plugins, foreign
  // <base> or form targets), so it cannot break the app's own features.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/farmer/listings/new', destination: '/farmer/dashboard?tab=lots&add=1', permanent: false },
      { source: '/farmer/listings/:id/edit', destination: '/farmer/dashboard?tab=lots', permanent: false },
      { source: '/buyer/discover', destination: '/compare-prices?category=produce', permanent: false },
      { source: '/buyer/checkout/:id', destination: '/compare-prices?category=produce', permanent: false },
      // The fertiliser tester is public now (no sign-in): one page for everyone.
      { source: '/farmer/tester', destination: '/supplies/tester', permanent: true },
      // Old demonstration pages that showed made-up people, prices and records.
      // Each now opens the real, working page for the same job.
      ...[
        ['/admin/analytics', '/admin/dashboard'],
        ['/admin/trust-safety', '/admin/dashboard'],
        ['/buyer-desk', '/buyer/dashboard'],
        ['/cold-store', '/rental/dashboard'],
        ['/consumer', '/compare-prices?category=produce'],
        ['/cooperative-hub', '/farmer/dashboard'],
        ['/expert-desk', '/expert'],
        ['/learn', '/expert'],
        ['/government-insights', '/mandi-weather'],
        ['/price-intelligence', '/mandi-weather'],
        ['/weather-alerts', '/mandi-weather'],
        ['/input-authenticity', '/supplies/tester'],
        ['/lender-view', '/'],
        ['/saathi', '/'],
        ['/sustainability', '/'],
        ['/schemes', '/farmer/dashboard'],
        ['/supplier-marketplace', '/compare-prices?category=supplies'],
        ['/supplies', '/compare-prices?category=supplies'],
        ['/supplies/hardware', '/compare-prices?category=supplies'],
        ['/supplies/hardware/compare', '/compare-prices?category=supplies'],
        ['/waste-market', '/compare-prices?category=produce'],
        ['/services', '/rental/dashboard'],
        ['/services/:id', '/rental/dashboard'],
        ['/traceability', '/track'],
      ].map(([source, destination]) => ({ source, destination, permanent: false })),
    ];
  },
};

export default nextConfig;
