'use client';

/**
 * Where people pay you: UPI ID and / or bank account (payout_accounts).
 * Shown only to the other side of a live booking or order
 * (kr_payment_details), never publicly.
 */
import { useState } from 'react';
import { Banknote, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Btn, Field, INPUT, Panel, type PortalTheme } from '@/components/portal/kit';
import { savePayout, type PayoutAccount } from '@/lib/db/rentals';

export function PayoutForm({ theme, payout, onSaved, intro = 'Only farmers with a booking at your store see these. Money comes straight to you.' }: { theme: PortalTheme; payout: PayoutAccount | null | undefined; onSaved: (p: PayoutAccount) => void; intro?: string }) {
  const [form, setForm] = useState<PayoutAccount>({ account_name: '', upi_id: '', account_number: '', ifsc: '', bank_name: '' });
  const [loadedFrom, setLoadedFrom] = useState<PayoutAccount | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  if (payout !== loadedFrom) {
    setLoadedFrom(payout);
    if (payout) setForm({ ...payout, upi_id: payout.upi_id ?? '', account_number: payout.account_number ?? '', ifsc: payout.ifsc ?? '', bank_name: payout.bank_name ?? '' });
  }

  const save = async () => {
    if (form.account_name.trim().length < 2) return toast.error('Add the account holder’s name.');
    const upiOk = !form.upi_id || /^[A-Za-z0-9._-]{2,64}@[A-Za-z]{2,64}$/.test(form.upi_id.trim());
    const bankOk = !form.account_number || (/^\d{6,20}$/.test(form.account_number.replace(/\s/g, '')) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test((form.ifsc ?? '').trim().toUpperCase()));
    if (!upiOk) return toast.error('That UPI ID does not look right (e.g. name@okhdfcbank).');
    if (!bankOk) return toast.error('Check the account number and IFSC (e.g. JAKA0SHOPIA).');
    if (!form.upi_id && !form.account_number) return toast.error('Add a UPI ID or a bank account.');
    setBusy(true);
    try {
      await savePayout(form);
      onSaved(form);
      toast.success('Payment details saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel theme={theme} title="Where farmers pay you" icon={Banknote}>
      {payout === undefined ? (
        <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
      ) : (
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <p className="text-sm text-slate-600">{intro}</p>
          <Field label="Account holder name">
            <input className={INPUT} value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
          </Field>
          <Field label="UPI ID" hint="Easiest for farmers: PhonePe, Google Pay, Paytm, BHIM.">
            <input className={INPUT} value={form.upi_id ?? ''} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} placeholder="e.g. valleyfresh@okhdfcbank" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bank account number (optional)">
              <input className={INPUT} inputMode="numeric" value={form.account_number ?? ''} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
            </Field>
            <Field label="IFSC">
              <input className={INPUT} value={form.ifsc ?? ''} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} placeholder="e.g. JAKA0SHOPIA" />
            </Field>
          </div>
          <Field label="Bank name">
            <input className={INPUT} value={form.bank_name ?? ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. J&K Bank" />
          </Field>
          <Btn theme={theme} type="submit" icon={Banknote} disabled={busy}>{busy ? 'Saving…' : 'Save payment details'}</Btn>
        </form>
      )}
    </Panel>
  );
}
