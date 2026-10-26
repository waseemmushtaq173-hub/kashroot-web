/**
 * /rental/receipt/<booking id> — a cold store booking's receipt, inside the
 * Cold Storage Booking portal (its sign-in comes first). Only the farmer who
 * booked and the store's owner can see it (components/rental/receipt).
 */
import type { Metadata } from 'next';

import { ReceiptView } from '@/components/rental/receipt/ReceiptView';

export const metadata: Metadata = { title: 'Cold storage receipt', robots: { index: false, follow: false } };

export default async function ColdReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptView id={decodeURIComponent(id).slice(0, 64)} />;
}
