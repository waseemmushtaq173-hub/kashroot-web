'use client';

/**
 * Where people pay you: UPI ID and / or bank account (payout_accounts).
 * Shown only to the other side of a live booking or order
 * (kr_payment_details), never publicly.
 * Adding them the first time needs no more than the sign-in; changing them
 * needs two-step sign-in (20261119000000_payout_two_step.sql), so a stolen
 * password cannot send someone's payments elsewhere. The form asks for the
 * code before saving a change, or says how to turn two-step on.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Banknote } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { UpiQr } from '@/components/payments/UpiQr';
import { Btn, Field, INPUT, Panel, Skeleton, type PortalTheme } from '@/components/portal/kit';
import { TwoStepVerify, twoStepState } from '@/components/security/TwoStep';
import { savePayout, type PayoutAccount } from '@/lib/db/rentals';

export function PayoutForm({ theme, payout, onSaved, intro = 'Only farmers with a booking at your store see these. Money comes straight to you.', title = 'Where farmers pay you' }: { theme: PortalTheme; payout: PayoutAccount | null | undefined; onSaved: (p: PayoutAccount) => void; intro?: string; title?: string }) {
  const [form, setForm] = useState<PayoutAccount>({ account_name: '', upi_id: '', account_number: '', ifsc: '', bank_name: '' });
  const [loadedFrom, setLoadedFrom] = useState<PayoutAccount | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Changing saved details: 'code' — type the authenticator code first; 'setup' — turn two-step on first.
  const [twoStep, setTwoStep] = useState<'code' | 'setup' | null>(null);
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
    if (payout) {
      const state = await twoStepState();
      if (!state.passed) return setTwoStep(state.hasFactor ? 'code' : 'setup');
    }
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
    <Panel theme={theme} title={title} icon={Banknote}>
      {payout === undefined ? (
        <Skeleton label="Loading…" rows={2} height="h-10" />
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
          {payout && <p className="text-xs text-slate-500">Changing saved details needs two-step sign-in, and you get an email each time.</p>}
          {twoStep === 'code' && (
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-sm">To change where you are paid, first type the code from your authenticator app.</p>
              <TwoStepVerify
                onDone={() => {
                  setTwoStep(null);
                  void save();
                }}
              />
            </div>
          )}
          {twoStep === 'setup' && (
            <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
              To change where you are paid, turn on two-step sign-in first — it keeps your payments safe if someone learns your password.{' '}
              <Link className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline" href="/account/two-step">Turn on two-step sign-in</Link>
            </p>
          )}
          <Btn theme={theme} type="submit" icon={Banknote} disabled={busy}>{busy ? 'Saving…' : 'Save payment details'}</Btn>
          {payout?.upi_id && (
            <div className="border-t border-slate-900/5 pt-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">Receive money: show this QR to the person paying you</p>
              <UpiQr upi={payout.upi_id} name={payout.account_name} caption={`Pays ${payout.upi_id}. They type the amount in their UPI app.`} />
            </div>
          )}
        </form>
      )}
    </Panel>
  );
}
