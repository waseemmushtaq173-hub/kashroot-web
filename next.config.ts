import type { NextConfig } from "next";

/** The origin of an env URL, or '' (e.g. the Supabase project, the old API). */
const originOf = (url?: string, ws = false) => {
  try {
    const u = new URL(url ?? '');
    return ws ? `${u.protocol === 'http:' ? 'ws' : 'wss'}://${u.host}` : u.origin;
  } catch {
    return '';
  }
};
const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
const dev = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy: the browser may load scripts, styles and fonts only
 * from KashRoot itself, images only from KashRoot and the few map/photo hosts
 * it uses, and may send data only to KashRoot and the services listed. An
 * injected script therefore cannot pull in outside code or send people's data
 * to another site. ('unsafe-inline' scripts are still needed by Next.js's
 * own start-up code; 'unsafe-eval' only in development.)
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://images.unsplash.com https://upload.wikimedia.org ${supabase}`.trim(),
  "font-src 'self' data:",
  ['connect-src', "'self'", 'https://api.data.gov.in', supabase, originOf(supabase, true), originOf(process.env.NEXT_PUBLIC_API_URL), originOf(process.env.NEXT_PUBLIC_WS_URL), dev ? 'ws: http://localhost:* http://127.0.0.1:*' : ''].filter(Boolean).join(' '),
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

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
  // Security headers on every response (see CSP above).
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
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Origin-Agent-Cluster', value: '?1' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Portals folded into others keep their old links working: selling is
      // part of the Farmer portal; transport and "Track a load" are part of
      // Tracking (which also opens without signing in).
      { source: '/seller/:path*', has: [{ type: 'query', key: 'tab', value: '(?<tab>orders|payouts)' }], destination: '/farmer/dashboard?tab=:tab', permanent: false },
      { source: '/seller/:path*', destination: '/farmer/dashboard?tab=lots', permanent: false },
      { source: '/seller-studio', destination: '/farmer/dashboard?tab=lots', permanent: false },
      { source: '/provider/:path*', destination: '/tracking/dashboard', permanent: false },
      { source: '/logistics', destination: '/tracking/dashboard', permanent: false },
      { source: '/login/seller', destination: '/login/farmer', permanent: false },
      { source: '/login/logistics', destination: '/login/tracking', permanent: false },
      { source: '/register/seller', destination: '/register/farmer', permanent: false },
      { source: '/register/logistics', destination: '/register/tracking', permanent: false },
      { source: '/track', destination: '/tracking/dashboard', permanent: false },
      { source: '/track/:code', destination: '/tracking/dashboard?code=:code', permanent: false },
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
        ['/traceability', '/tracking/dashboard'],
        // The Kashmiri Lab (word list for the assistant) was removed.
        ['/koshur', '/'],
      ].map(([source, destination]) => ({ source, destination, permanent: false })),
    ];
  },
};

export default nextConfig;
