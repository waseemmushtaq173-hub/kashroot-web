import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

/** Search engines may read the public pages; dashboards and APIs are private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/buyer/discover'],
      disallow: ['/api/', '/farmer/', '/buyer/', '/seller/', '/provider/', '/admin/', '/kissan-tools/', '/rental/', '/dealer/', '/expert$', '/expert/', '/kyc/', '/track/', '/drive/', '/tracking/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
