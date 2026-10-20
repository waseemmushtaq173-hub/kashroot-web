'use client';

/**
 * Where farmers pay the owner (payout_accounts — one set per person, used
 * wherever they are paid on KashRoot): the account holder's name, the bank
 * account typed twice, the IFSC (the bank's name is read from it), and a UPI
 * ID. Some farmers do not use UPI, so a bank account is asked for first;
 * either one is enough. Only a farmer with a live booking at the store sees
 * these, and the money goes straight to the owner — KashRoot never holds it.
 */
import { useState } from 'react';
import { Banknote, Landmark, Loader2 } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Btn, Panel, PORTAL_THEMES } from '@/components/portal/kit';
import { UpiQr } from '@/components/payments/UpiQr';
import { Box } from '@/components/rental/owner/fields';
import { bankOf, blankPayout, IFSC_RE, payoutIssues, type Issue, type PayoutDraft } from '@/lib/coldStore';
import { savePayout, type PayoutAccount } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;

export const payoutDraftOf = (p: PayoutAccount | null | undefined, name = ''): PayoutDraft =>
  p ? { name: p.account_name, account: p.account_number ?? '', account2: p.account_number ?? '', ifsc: p.ifsc ?? '', bank: p.bank_name ?? '', upi: p.upi_id ?? '' } : blankPayout(name);

/** Save the payment details; the saved row, or a thrown error with a plain message. */
export async function savePayoutDraft(p: PayoutDraft): Promise<PayoutAccount> {
  const ifsc = p.ifsc.trim().toUpperCase();
  const acc = p.account.replace(/[\s-]/g, '');
  const row: PayoutAccount = {
    account_name: p.name.trim(),
    account_number: acc || null,
    ifsc: acc ? ifsc : null,
    bank_name: acc ? p.bank.trim() || bankOf(ifsc) : null,
    upi_id: p.upi.trim() || null,
  };
  await savePayout(row);
  return row;
}

/** The boxes, with their problems once the owner has left them or pressed save. */
export function PayoutFields({ value, onChange, showAll }: { value: PayoutDraft; onChange: (p: PayoutDraft) => void; showAll: boolean }) {
  const [left, setLeft] = useState<Set<string>>(new Set());
  const issues = payoutIssues(value);
  const of = (f: string): Issue[] => (showAll || left.has(f) ? issues.filter((i) => i.field === f) : []);
  const box = (f: keyof PayoutDraft, label: string, extra: Partial<Parameters<typeof Box>[0]> = {}) => (
    <Box name={`payout.${f}`} label={label} value={value[f]} onChange={(v) => onChange({ ...value, [f]: v })} onBlur={() => setLeft((s) => new Set(s).add(f))} issues={of(f)} {...extra} />
  );
  const ifsc = value.ifsc.trim().toUpperCase();
  const bank = IFSC_RE.test(ifsc) ? bankOf(ifsc) : null;
  return (
    <div className="space-y-5">
      {box('name', 'Account holder name', { autoComplete: 'name', hint: 'As the bank has it.', maxLength: 80 })}
      <fieldset className="space-y-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-900/5">
        <legend className="sr-only">Bank account</legend>
        <p className="flex items-center gap-2 text-base font-semibold text-slate-900"><Landmark className="h-5 w-5 text-violet-700" aria-hidden /> Bank account</p>
        {box('account', 'Bank account number', { number: true, whole: true, autoComplete: 'off' })}
        {box('account2', 'Type the account number again', { number: true, whole: true, autoComplete: 'off' })}
        <div className="grid gap-5 sm:grid-cols-2">
          <Box
            name="payout.ifsc"
            label="IFSC"
            value={value.ifsc}
            onChange={(v) => {
              const next = v.toUpperCase().replace(/\s/g, '');
              const found = IFSC_RE.test(next) ? bankOf(next) : null;
              // Fill the bank name from the IFSC, unless the owner wrote another.
              onChange({ ...value, ifsc: next, bank: found && (!value.bank || value.bank === bankOf(value.ifsc)) ? found : value.bank });
            }}
            onBlur={() => setLeft((s) => new Set(s).add('ifsc'))}
            issues={of('ifsc')}
            maxLength={11}
            placeholder="e.g. JAKA0SHOPIA"
            hint={bank ? `Bank: ${bank}` : 'On your passbook or cheque book: 11 letters and numbers.'}
          />
          {box('bank', 'Bank name', { maxLength: 80 })}
        </div>
      </fieldset>
      {box('upi', 'UPI ID (optional)', { placeholder: 'e.g. 9876543210@ybl', hint: 'For farmers who pay with PhonePe, Google Pay, Paytm or BHIM.' })}
      <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-950 ring-1 ring-violet-200">A bank account or a UPI ID is enough. Only farmers with a booking at your store see these, and they pay you directly — KashRoot never holds the money.</p>
    </div>
  );
}

/** The owner's "Payment details" tab: the same boxes, with their own Save. */
export function PaymentDetails({ payout, onSaved, name }: { payout: PayoutAccount | null | undefined; onSaved: (p: PayoutAccount) => void; name: string }) {
  const [draft, setDraft] = useState<PayoutDraft>(() => payoutDraftOf(payout, name));
  const [from, setFrom] = useState(payout);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  if (payout !== from) {
    setFrom(payout);
    setDraft(payoutDraftOf(payout, name));
  }
  const save = async () => {
    setTried(true);
    const issues = payoutIssues(draft);
    if (issues.length) return toast.error(issues[0].message);
    setBusy(true);
    try {
      onSaved(await savePayoutDraft(draft));
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
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <PayoutFields value={draft} onChange={setDraft} showAll={tried} />
          <Btn theme={theme} type="submit" className="min-h-[48px] w-full sm:w-auto" icon={Banknote} disabled={busy}>{busy ? 'Saving…' : 'Save payment details'}</Btn>
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
