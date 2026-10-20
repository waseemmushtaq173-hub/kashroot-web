/** /deliver/<token> — the driver's page for a Kissan Tools delivery (no sign-in; the link is the key). */
import type { Metadata } from 'next';

import { DriverTrip } from '@/components/shop/DriverTrip';

export const metadata: Metadata = { title: 'Delivery — share location', robots: { index: false, follow: false } };

export default async function DeliverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DriverTrip token={decodeURIComponent(token).slice(0, 80)} />;
}
