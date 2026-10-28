/**
 * Test page for the cold store (Playwright, tests/coldstore-owner.spec.ts): the
 * real owner wizard, and the store as farmers see it, built from what was typed
 * — without signing in or saving anything. Exists only when the server starts
 * with KR_TEST_PAGES=1; everywhere else (the live site) it is "not found".
 */
import { notFound } from 'next/navigation';

import { ColdStoreTestPage } from './client';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.KR_TEST_PAGES !== '1') notFound();
  return <ColdStoreTestPage />;
}
