import type { MetadataRoute } from 'next';

import { PORTAL_IDS, SIGNUP_PORTALS } from '@/lib/auth/roles';
import { SITE_URL } from '@/lib/site';

/** Public pages for search engines. Signed-in dashboards are left out. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: 'daily' | 'weekly' | 'monthly' = 'weekly') => ({ url: `${SITE_URL}${path}`, lastModified: now, changeFrequency, priority });
  return [
    page('/', 1, 'daily'),
    page('/mandi-weather', 0.9, 'daily'),
    page('/compare-prices', 0.8, 'daily'),
    page('/orchard-health', 0.8),
    page('/escrow', 0.7),
    page('/traceability', 0.6),
    page('/season-planner', 0.6),
    page('/supplies', 0.6),
    page('/support', 0.4, 'monthly'),
    page('/terms', 0.2, 'monthly'),
    page('/privacy', 0.2, 'monthly'),
    ...PORTAL_IDS.filter((p) => p !== 'admin').map((p) => page(`/login/${p}`, 0.5, 'monthly')),
    ...SIGNUP_PORTALS.map((p) => page(`/register/${p}`, 0.5, 'monthly')),
  ];
}
