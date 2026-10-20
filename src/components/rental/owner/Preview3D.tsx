'use client';

/**
 * The owner's store in 3D while they type: the very chamber floors that will
 * be saved (lib/coldStore previewChambers), in the same 3D view farmers use
 * (components/rental/ColdStore3D). three.js loads only when this opens.
 */
import dynamic from 'next/dynamic';
import { memo, useCallback, useMemo } from 'react';

import type { Look } from '@/components/rental/placeLook';
import { previewChambers, type StoreModel } from '@/lib/coldStore';
import type { ColdChamber } from '@/lib/db/coldMap';

const ColdStore3D = dynamic(() => import('@/components/rental/ColdStore3D').then((m) => m.ColdStore3D), {
  ssr: false,
  loading: () => <div className="grid h-[420px] place-items-center rounded-3xl bg-slate-100 text-sm text-slate-500">Opening the 3D view…</div>,
});

export const Preview3D = memo(function Preview3D({ model, listingId, selected, onPick }: { model: StoreModel; listingId: string; selected: string | null; onPick: (key: string) => void }) {
  const chambers = useMemo(() => previewChambers(model, listingId), [model, listingId]);
  const stateOf = useCallback((): Look => 'free', []);
  const roomOf = useCallback((c: ColdChamber) => c.boxes_per_slot, []);
  const active = chambers.find((c) => c.id.startsWith(`preview:${selected}:`))?.id ?? null;
  const onActive = useCallback((id: string) => onPick(id.split(':')[1] ?? ''), [onPick]);
  if (!chambers.length) {
    return <p className="grid min-h-[200px] place-items-center rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-600 ring-1 ring-slate-900/5">Fill in a chamber’s count, floors, size and door — it appears here in 3D.</p>;
  }
  return <ColdStore3D chambers={chambers} stateOf={stateOf} roomOf={roomOf} mode="owner" active={active} onActive={onActive} />;
});
