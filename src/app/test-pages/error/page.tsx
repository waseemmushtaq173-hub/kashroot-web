/**
 * Test page for the error screen (Playwright, tests/error-screen.spec.ts): a client page that fails while
 * rendering, with the same message a phone showed ("Cannot read properties of undefined (reading 'replace')"),
 * so the screen people see after a crash can be checked. Exists only when the server starts with
 * KR_TEST_PAGES=1; everywhere else (the live site) it is "not found".
 */
import { notFound } from 'next/navigation';

import { Boom } from './client';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.KR_TEST_PAGES !== '1') notFound();
  return <Boom />;
}
