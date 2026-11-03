'use client';

/**
 * The seller ships a Kissan Tools order: the vehicle number or courier, and
 * the driver's name and mobile (both optional) so the buyer can call.
 * In a business (My business): one of its own drivers can be chosen instead;
 * the database checks the driver belongs to the order's business.
 */
import { useState } from 'react';
import { Truck } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Btn, Field, INPUT, type PortalTheme } from '@/components/portal/kit';
import { assignDriver, shipOrder, type OrgDriver } from '@/lib/db/shop';

export function ShipForm({ orderId, theme, onShipped, drivers = [] }: { orderId: string; theme: PortalTheme; onShipped: () => void; /** The business's drivers to choose from. */ drivers?: OrgDriver[] }) {
  const [form, setForm] = useState({ vehicle: '', driverName: '', driverPhone: '', note: '' });
  const [driver, setDriver] = useState('');
  const chosen = drivers.find((d) => d.id === driver) ?? null;
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setProblem(null);
  };

  const ship = async () => {
    if (chosen) {
      setBusy(true);
      try {
        await assignDriver(orderId, chosen.id, form.vehicle.trim(), form.note.trim());
        toast.success(`Given to ${chosen.name}. Send them the driver link so the buyer can follow the vehicle.`);
        onShipped();
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'Could not give the order to the driver. Try again.');
      } finally {
        setBusy(false);
      }
      return;
    }
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
      {drivers.length > 0 && (
        <Field label="Driver" hint="One of your business's drivers, or someone else written below.">
          <select
            className={`${INPUT} min-h-11`}
            value={driver}
            onChange={(e) => {
              setDriver(e.target.value);
              setProblem(null);
            }}
          >
            <option value="">Someone else (write below)</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.phone}
                {d.vehicle ? ` · ${d.vehicle}` : ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={chosen ? `Vehicle number (optional${chosen.vehicle ? ` — else ${chosen.vehicle}` : ''})` : 'Vehicle number or courier name'}>
        <input className={`${INPUT} min-h-11 uppercase`} value={form.vehicle} onChange={(e) => set({ vehicle: e.target.value })} placeholder={chosen?.vehicle ?? 'e.g. JK01 AB 1234'} autoCapitalize="characters" />
      </Field>
      {!chosen && (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Driver’s name (optional)">
          <input className={`${INPUT} min-h-11`} value={form.driverName} onChange={(e) => set({ driverName: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="Driver’s mobile (optional)" hint="The buyer can call the driver.">
          <input type="tel" inputMode="numeric" className={`${INPUT} min-h-11`} value={form.driverPhone} onChange={(e) => set({ driverPhone: e.target.value })} placeholder="e.g. 9876543210" autoComplete="off" />
        </Field>
      </div>
      )}
      <Field label="Note for the buyer (optional)">
        <input className={`${INPUT} min-h-11`} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Reaches by Tuesday evening" />
      </Field>
      {problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{problem}</p>}
      <Btn theme={theme} icon={Truck} className="min-h-11" disabled={busy} onClick={() => void ship()}>{busy ? 'Saving…' : chosen ? `Give to ${chosen.name} and mark shipped` : 'Mark shipped'}</Btn>
    </div>
  );
}
