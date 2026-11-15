'use client';

/**
 * ?view=owner(&step=2): the owner wizard, at the chambers or the building (the
 * chambers can be typed; nothing is saved — the wizard keeps its draft on this
 * browser, as for a real owner). ?view=farmer: that draft as farmers see the
 * store — the very rows the wizard would save (previewChambers), in the
 * Drawing, the 3D view and the walk inside. Tapping a place there chooses it
 * (one at a time, kept only on this page) and opens the booking's own
 * selected-bin panel, so the panel is tested without signing in.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ColdStoreExplorer } from '@/components/rental/ColdStoreMap';
import type { Look } from '@/components/rental/placeLook';
import { SelectedBinPanel } from '@/components/rental/SelectedBinPanel';
import { OwnerWizard } from '@/components/rental/owner/OwnerWizard';
import { previewChambers, storeModel, withAllBoxes, type StoreDraft } from '@/lib/coldStore';
import type { Account } from '@/lib/db/client';
import type { ColdChamber } from '@/lib/db/coldMap';

const OWNER: Account = { id: 'test-owner', email: 'owner@test.local', name: 'Test Owner', phone: '9876543210', district: 'Shopian', village: 'Test', lang: null, business: '', licence: '', staff: [] };
const DRAFT_KEY = `kr_cold_wizard:${OWNER.id}:new`;

export function ColdStoreTestPage() {
  const [view, setView] = useState<'owner' | 'farmer' | null>(null);
  const [step, setStep] = useState<2 | 3>(3);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get('view');
    queueMicrotask(() => {
      setStep(q.get('step') === '2' ? 2 : 3);
      setView(v === 'farmer' ? 'farmer' : 'owner');
    });
  }, []);
  if (!view) return null;
  return (
    <main className="kr-light min-h-screen bg-[#fbf8f1] text-slate-900">
      <div className="mx-auto max-w-6xl p-4">
      <p className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950">Test page — nothing here is saved.</p>
      {view === 'owner' ? <OwnerWizard account={OWNER} listing={null} rows={[]} payout={null} start={step} onClose={() => {}} onChanged={() => {}} onPayout={() => {}} /> : <AsFarmersSee />}
      </div>
    </main>
  );
}

function AsFarmersSee() {
  const [draft, setDraft] = useState<StoreDraft | null | undefined>(undefined);
  useEffect(() => {
    let d: StoreDraft | null = null;
    try {
      const v = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as StoreDraft | null;
      d = v && Array.isArray(v.chambers) ? { ...v, chambers: v.chambers.map(withAllBoxes) } : null;
    } catch {
      d = null;
    }
    queueMicrotask(() => setDraft(d));
  }, []);
  const model = useMemo(() => (draft ? storeModel(draft) : null), [draft]);
  const rows = useMemo(() => (model ? previewChambers(model, 'test') : []), [model]);
  const [active, setActive] = useState<string | null>(null);
  const [pick, setPick] = useState<{ chamber: ColdChamber; slot: string; boxes: number } | null>(null);
  const [booked, setBooked] = useState(false);
  // ?looks=1: a spread of every look (shared, booked, held, the viewer's own) by place number, so the colours can be checked by eye.
  const [looks] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('looks') === '1');
  const lookOf = useCallback(
    (slot: string): Look => {
      if (!looks) return 'free';
      const n = [...slot].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 9;
      return n === 1 ? 'part' : n === 2 || n === 3 ? 'booked' : n === 4 ? 'held' : n === 5 ? 'mine' : 'free';
    },
    [looks],
  );
  const stateOf = useCallback((c: ColdChamber, slot: string): Look => (pick && pick.chamber.id === c.id && pick.slot === slot ? 'selected' : lookOf(slot)), [pick, lookOf]);
  const roomOf = useCallback((c: ColdChamber, slot: string) => (lookOf(slot) === 'free' ? c.boxes_per_slot : lookOf(slot) === 'part' ? Math.ceil(c.boxes_per_slot / 2) : 0), [lookOf]);
  const onPlace = useCallback((c: ColdChamber, slot: string, look: Look) => {
    setBooked(false);
    setPick(look === 'selected' ? null : { chamber: c, slot, boxes: c.boxes_per_slot });
  }, []);
  if (draft === undefined) return null;
  if (!model || !rows.length) return <p>No store typed yet: open ?view=owner first.</p>;
  return (
    <section aria-label="As farmers see it" className="space-y-3">
      <h1 className="text-xl font-bold">{model.store.title || 'Test cold store'} — as farmers see it</h1>
      <ColdStoreExplorer chambers={rows} stateOf={stateOf} roomOf={roomOf} mode="book" onPlace={onPlace} active={active ?? rows[0].id} onActive={setActive} legend={['free', 'part', 'selected', 'held', 'booked', 'mine', 'blocked']} building={model.building} rate={null} />
      {pick && (
        <SelectedBinPanel
          facility={model.store.title || 'Test cold store'}
          chamber={pick.chamber}
          slot={pick.slot}
          room={pick.chamber.boxes_per_slot}
          mineStored={0}
          boxes={pick.boxes}
          rate={Number(pick.chamber.rate) || 0}
          months={6}
          minUnits={1}
          totalChosen={pick.boxes}
          onBoxes={(n) => setPick({ ...pick, boxes: n })}
          onRemove={() => setPick(null)}
          onBook={() => setBooked(true)}
        />
      )}
      {booked && <p role="status">Test page: the real booking window now opens its confirm step.</p>}
    </section>
  );
}
