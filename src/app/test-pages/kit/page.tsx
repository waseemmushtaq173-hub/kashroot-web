/**
 * Test page for the portal kit (before / after screenshots of the look): cards, tiles, badges,
 * buttons, an empty state and the skeleton loader, as every portal shows them. Made-up labels only,
 * no numbers. Exists only when the server starts with KR_TEST_PAGES=1; everywhere else "not found".
 */
import { notFound } from 'next/navigation';

import { KitTestPage } from './client';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.KR_TEST_PAGES !== '1') notFound();
  return <KitTestPage />;
}
