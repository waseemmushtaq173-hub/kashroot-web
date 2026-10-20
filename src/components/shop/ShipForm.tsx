'use client';

/**
 * The seller ships a Kissan Tools order: the vehicle number or courier, and
 * the driver's name and mobile (both optional) so the buyer can call.
 */
import { useState } from 'react';
import { Truck } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Btn, Field, INPUT, type PortalTheme } from '@/components/portal/kit';
import { shipOrder } from '@/lib/db/shop';

export function ShipForm({ orderId, theme, onShipped }: { orderId: string; theme: PortalTheme; onShipped: () => void }) {
  const [form, setForm] = useState({ vehicle: '', driverName: '', driverPhone: '', note: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setProblem(null);
  };

  const ship = async () => {
    const vehicle = form.vehicle.trim();
    const phone = form.driverPhone.replace(/[\s-]/g, '').replace(/^(\+?91)(?=\d{10}$)/, '');
    if (vehicle.length < 2) return setProblem('Write the vehicle number (for example JK01 AB 1234) or the courier name.');
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return setProblem('Write the driver’s 10-digit mobile number, for example 9876543210. Or leave it empty.');
    setBusy(true);
    try {
      await shipOrder(orderId, { vehicle, driverName: form.driverName.trim(), driverPhone: phone, note: form.note.trim() });
      toast.success('Marked shipped. Now share the location so the buyer can see it.');
      onShipped();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not mark the order shipped. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-orange-200">
      <p className="font-semibold text-slate-900">Ship the order</p>
      <Field label="Vehicle number or courier name">
        <input className={`${INPUT} min-h-11 uppercase`} value={form.vehicle} onChange={(e) => set({ vehicle: e.target.value })} placeholder="e.g. JK01 AB 1234" autoCapitalize="characters" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Driver’s name (optional)">
          <input className={`${INPUT} min-h-11`} value={form.driverName} onChange={(e) => set({ driverName: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="Driver’s mobile (optional)" hint="The buyer can call the driver.">
          <input type="tel" inputMode="numeric" className={`${INPUT} min-h-11`} value={form.driverPhone} onChange={(e) => set({ driverPhone: e.target.value })} placeholder="e.g. 9876543210" autoComplete="off" />
        </Field>
      </div>
      <Field label="Note for the buyer (optional)">
        <input className={`${INPUT} min-h-11`} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Reaches by Tuesday evening" />
      </Field>
      {problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{problem}</p>}
      <Btn theme={theme} icon={Truck} className="min-h-11" disabled={busy} onClick={() => void ship()}>{busy ? 'Saving…' : 'Mark shipped'}</Btn>
    </div>
  );
}
