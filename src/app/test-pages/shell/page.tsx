/**
 * Test page for the portal frame (screenshots and tests of the sidebar greeting, the stat cards, the phone's bottom bar
 * and the expert chat). Made-up names and labels only, no real numbers. Exists only when the server starts with
 * KR_TEST_PAGES=1; everywhere else "not found".
 */
import { notFound } from 'next/navigation';

import { ShellTestPage } from './client';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.KR_TEST_PAGES !== '1') notFound();
  return <ShellTestPage />;
}
