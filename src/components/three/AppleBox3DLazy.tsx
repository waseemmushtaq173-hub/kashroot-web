'use client';

/**
 * AppleBox3D, fetched when a box is actually shown. AppleBox3D imports the 3D libraries (three.js and drei, about
 * 0.7 MB of script), and importing it directly made every farmer, buyer and dealer page download them at once. Here the
 * libraries come only when a packing with a layer count is on screen; "Loose / Crate Packed" shows nothing and fetches nothing.
 */
import dynamic from 'next/dynamic';

import { singleLayerCount } from '@/lib/packing';

const AppleBox3D = dynamic(() => import('./AppleBox3D').then((m) => m.AppleBox3D), {
  ssr: false,
  loading: () => <div className="mt-3 h-[240px] rounded-2xl bg-[#f5ead8] sm:h-[280px]" aria-hidden />,
});

export function AppleBox3DLazy({ layers, className = '' }: { layers: number | string; className?: string }) {
  // A lot with both 4 and 5 layer boxes cannot be drawn as one box.
  if (singleLayerCount(String(layers)) === null) return null;
  return <AppleBox3D layers={layers} className={className} />;
}
