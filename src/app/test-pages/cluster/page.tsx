/**
 * Test page for the Buyer portal's 10 km cluster and 2,000-box truck (Playwright, tests/cluster.spec.ts):
 * the real produce shop exactly as the Buyer portal shows it, on the real listings, without signing in
 * (nothing can be ordered from here). Exists only when the server starts with KR_TEST_PAGES=1; everywhere
 * else (the live site) it is "not found".
 */
import { notFound } from 'next/navigation';

import { ClusterTestPage } from './client';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.KR_TEST_PAGES !== '1') notFound();
  return <ClusterTestPage />;
}
