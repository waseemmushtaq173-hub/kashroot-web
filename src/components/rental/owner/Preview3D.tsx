'use client';

/**
 * The owner's store in 3D while they type: the very chamber floors that will
 * be saved (lib/coldStore previewChambers). Two views, the walkthrough first:
 * the same 3D view farmers use (components/rental/ColdStore3D) and the
 * industrial digital twin (components/rental/IndustrialColdStoreTwin3D),
 * which draws the same places as real bins or crates. three.js and R3F load
 * only when their view opens.
 */
import dynamic from 'next/dynamic';
import { Factory, Footprints } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';

import { twinPlanOf } from '@/components/rental/twinMap';
import type { Look } from '@/components/rental/placeLook';
import type { StorageSlotRecord } from '@/components/rental/IndustrialColdStoreTwin3D';
import { previewChambers, type StoreModel } from '@/lib/coldStore';
import type { ColdChamber } from '@/lib/db/coldMap';

const ColdStore3D = dynamic(() => import('@/components/rental/ColdStore3D').then((m) => m.ColdStore3D), {
  ssr: false,
  loading: () => <div className="grid h-[420px] place-items-center rounded-3xl bg-slate-100 text-sm text-slate-500">Opening the 3D view…</div>,
});

const IndustrialColdStoreTwin3D = dynamic(
  () => import('@/components/rental/IndustrialColdStoreTwin3D').then((m) => m.IndustrialColdStoreTwin3D),
  {
    ssr: false,
    loading: () => <div className="grid h-[420px] place-items-center rounded-3xl bg-slate-100 text-sm text-slate-500">Opening the digital twin…</div>,
  },
);

const pill = (on: boolean) =>
  `inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-semibold ring-2 transition ${
    on ? 'bg-sky-700 text-white ring-sky-700 shadow' : 'bg-white text-sky-900 ring-slate-200 hover:ring-sky-400'
  }`;

export const Preview3D = memo(function Preview3D({ model, listingId, selected, onPick }: { model: StoreModel; listingId: string; selected: string | null; onPick: (key: string) => void }) {
  const chambers = useMemo(() => previewChambers(model, listingId), [model, listingId]);
  // The walkthrough farmers use stays the default; the twin is one tap away.
  const [view3d, setView3d] = useState<'walk' | 'twin'>('walk');
  const stateOf = useCallback((): Look => 'free', []);
  const roomOf = useCallback((c: ColdChamber) => c.boxes_per_slot, []);
  const active = chambers.find((c) => c.id.startsWith(`preview:${selected}:`))?.id ?? null;
  const onActive = useCallback((id: string) => onPick(id.split(':')[1] ?? ''), [onPick]);

  const plan = useMemo(() => (view3d === 'twin' ? twinPlanOf(chambers) : null), [chambers, view3d]);
  const activeChamber = plan && active ? chambers.find((c) => c.id === active) ?? null : null;
  const selectedSlotKeys = useMemo(() => (plan && activeChamber ? plan.slotsOf(activeChamber) : []), [plan, activeChamber]);
  const onToggleSlot = useCallback(
    (rec: StorageSlotRecord) => {
      const c = plan?.byCode.get(rec.chamberCode);
      if (c) onPick(c.id.split(':')[1] ?? '');
    },
    [plan, onPick],
  );

  if (!chambers.length) {
    return <p className="grid min-h-[200px] place-items-center rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-600 ring-1 ring-slate-900/5">Fill in a chamber’s count, floors, size and door — it appears here in 3D.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="3D view">
        <button type="button" aria-pressed={view3d === 'walk'} onClick={() => setView3d('walk')} className={pill(view3d === 'walk')}>
          <Footprints className="h-4 w-4" aria-hidden /> Walkthrough
        </button>
        <button type="button" aria-pressed={view3d === 'twin'} onClick={() => setView3d('twin')} className={pill(view3d === 'twin')}>
          <Factory className="h-4 w-4" aria-hidden /> Industrial digital twin
        </button>
      </div>
      {view3d === 'walk' ? (
        <ColdStore3D chambers={chambers} stateOf={stateOf} roomOf={roomOf} mode="owner" active={active} onActive={onActive} onOpenTwin={() => setView3d('twin')} />
      ) : (
        plan && (
          <IndustrialColdStoreTwin3D
            facilityCode={`KS-${listingId.slice(0, 6).toUpperCase()}`}
            facilityName="Your cold store"
            buildingLengthM={0}
            buildingWidthM={0}
            buildingHeightM={0}
            corridorLayout="BOTH_SIDES"
            chambers={plan.configs}
            selectedSlotKeys={selectedSlotKeys}
            onToggleSelectSlot={onToggleSlot}
          />
        )
      )}
    </div>
  );
});
