/** /drive/<token> — the driver's page (no sign-in; the link is the key). */
import type { Metadata } from 'next';

import { DriverShare } from '@/components/tracking/DriverShare';

export const metadata: Metadata = { title: 'Driver — share location', robots: { index: false, follow: false } };

export default async function DrivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DriverShare token={decodeURIComponent(token).slice(0, 64)} />;
}
