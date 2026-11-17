'use client';

/**
 * ?view=owner is the cold-store test page (../cold-store); this page opens the farmers' booking window itself, on the draft
 * typed there, for a test farmer. A test sets the draft in localStorage, answers the database's calls, opens this page, and
 * then clicks through: a bin in 3D, "Book Selected Bin Capacity", the confirm step, the booking, the pay step.
 */
import { useEffect, useMemo, useState } from 'react';

import { ColdBooking } from '@/components/rental/ColdBooking';
import { previewChambers, storeModel, withAllBoxes, type StoreDraft } from '@/lib/coldStore';
import type { Account } from '@/lib/db/client';
import type { RentalListing } from '@/lib/db/rentals';

const OWNER_ID = 'test-owner';
const DRAFT_KEY = `kr_cold_wizard:${OWNER_ID}:new`;
const LISTING_ID = '00000000-0000-4000-8000-0000000000aa';
const FARMER: Account = { id: '00000000-0000-4000-8000-0000000000bb', email: 'farmer@test.local', name: 'Test Farmer', phone: '9876543210', district: 'Shopian', village: 'Test', lang: null, business: '', licence: '', staff: [] };

export function BookingTestPage() {
  const [draft, setDraft] = useState<StoreDraft | null | undefined>(undefined);
  const [closed, setClosed] = useState<'closed' | 'booked' | null>(null);
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
  const chambers = useMemo(() => (model ? previewChambers(model, LISTING_ID) : []), [model]);
  const listing: RentalListing | null = useMemo(
    () =>
      model
        ? {
            id: LISTING_ID,
            owner_id: OWNER_ID,
            kind: 'cold_store',
            title: model.store.title || 'Test cold store',
            owner_name: 'Test Owner',
            phone: '9876543211',
            district: 'Shopian',
            address: 'Test address',
            unit: 'box_month',
            capacity: chambers.reduce((s, c) => s + c.boxes_per_slot * 10, 0) || 1,
            available: 1,
            rate: Number(chambers[0]?.rate) || 45,
            min_units: 1,
            temperature: null,
            details: null,
            active: true,
            updated_at: new Date().toISOString(),
            manager_name: null,
            manager_phone: null,
            state: 'Jammu & Kashmir',
            area: null,
            building: null,
            // A test owner's own payout address: this page exists only for tests and saves nothing.
            owner_payout_upi: 'test-owner@testbank',
            owner_bank_account_name: 'Test Owner',
          }
        : null,
    [model, chambers],
  );
  if (draft === undefined) return null;
  if (!listing || !chambers.length) return <p>No store typed yet: open the cold-store test page (?view=owner) first.</p>;
  return (
    <main className="kr-light min-h-screen bg-[#fbf8f1] p-4 text-slate-900">
      <p className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950">Test page — nothing here is saved.</p>
      {closed ? (
        <p role="status" data-testid="window-state">{closed === 'booked' ? 'The booking window closed after a booking.' : 'The booking window was closed.'}</p>
      ) : (
        <ColdBooking listing={listing} chambers={chambers} account={FARMER} onClose={() => setClosed('closed')} onBooked={() => setClosed('booked')} />
      )}
    </main>
  );
}
