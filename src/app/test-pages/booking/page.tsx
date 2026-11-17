/**
 * Test page for the cold store's booking window (Playwright, tests/coldstore-book-pay.spec.ts): the real ColdBooking window
 * over a store built from the draft typed in the owner wizard, signed in as a test farmer. The test supplies the database's
 * answers (the places taken, the booking made); nothing is saved. Exists only when the server starts with KR_TEST_PAGES=1;
 * everywhere else (the live site) it is "not found".
 */
import { notFound } from 'next/navigation';

import { BookingTestPage } from './client';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.KR_TEST_PAGES !== '1') notFound();
  return <BookingTestPage />;
}
