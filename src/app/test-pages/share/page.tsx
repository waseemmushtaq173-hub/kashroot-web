/**
 * Test page for sharing a bin (the farmer asked: Yes / No; the farmer waiting: "waiting for the other farmer's yes"). The
 * database's answers are supplied by the test. Made-up names only. Exists only when the server starts with KR_TEST_PAGES=1;
 * everywhere else "not found".
 */
import { notFound } from 'next/navigation';

import { ShareTestPage } from './client';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.KR_TEST_PAGES !== '1') notFound();
  return <ShareTestPage />;
}
