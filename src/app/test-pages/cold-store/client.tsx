'use client';

/**
 * ?view=owner(&step=2): the owner wizard, at the chambers or the building (the
 * chambers can be typed; nothing is saved — the wizard keeps its draft on this
 * browser, as for a real owner). ?view=farmer: that draft as farmers see the
 * store — the very rows the wizard would save (previewChambers), in the
 * Drawing, the 3D view and the walk inside.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ColdStoreExplorer } from '@/components/rental/ColdStoreMap';
import type { Look } from '@/components/rental/placeLook';
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
  const stateOf = useCallback((): Look => 'free', []);
  const roomOf = useCallback((c: ColdChamber) => c.boxes_per_slot, []);
  if (draft === undefined) return null;
  if (!model || !rows.length) return <p>No store typed yet: open ?view=owner first.</p>;
  return (
    <section aria-label="As farmers see it" className="space-y-3">
      <h1 className="text-xl font-bold">{model.store.title || 'Test cold store'} — as farmers see it</h1>
      <ColdStoreExplorer chambers={rows} stateOf={stateOf} roomOf={roomOf} mode="book" active={active ?? rows[0].id} onActive={setActive} legend={['free']} building={model.building} rate={null} />
    </section>
  );
}
