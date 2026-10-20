'use client';

/**
 * Paying the seller for a Kissan Tools order, before it ships: the seller's
 * account holder name, account number, IFSC, bank and UPI ID (each with a
 * Copy button), the exact amount, "Pay by UPI app" and a UPI QR code. The
 * buyer pays the seller directly — KashRoot does not hold the money — and
 * then writes the payment reference (UTR) here.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Copy, Loader2, Smartphone } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Btn, INPUT, type PortalTheme } from '@/components/portal/kit';
import { inr } from '@/lib/db/client';
import { paymentDetails, upiLink, type PayoutAccount } from '@/lib/db/rentals';

// The QR code library loads only when a payment is due.
const UpiQr = dynamic(() => import('@/components/payments/UpiQr').then((m) => m.UpiQr), { ssr: false });

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Could not copy. Press and hold the text to copy it.');
  }
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-900/5 py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`break-all font-semibold text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy(value, label)}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-slate-50 px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
      >
        <Copy className="h-4 w-4" aria-hidden /> Copy
      </button>
    </div>
  );
}

export function ShopPay({ orderId, amount, note, theme, paidRef, onPaid }: {
  /** Any line of the basket: the seller's details come with it. */
  orderId: string;
  amount: number;
  note: string;
  theme: PortalTheme;
  /** The reference already given (the seller said it did not arrive). */
  paidRef?: string | null;
  onPaid: (ref: string) => Promise<void>;
}) {
  const [details, setDetails] = useState<PayoutAccount | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    paymentDetails('order', orderId)
      .then((d) => live && setDetails(d))
      .catch((err) => live && setError(err instanceof Error ? err.message : 'Could not load the payment details.'));
    return () => {
      live = false;
    };
  }, [orderId]);

  const submit = async () => {
    const clean = ref.replace(/[\s-]/g, '');
    if (!clean) return setProblem('Write the payment reference (UTR). Your UPI app shows it after you pay: usually 12 digits.');
    if (!/^[A-Za-z0-9]{6,30}$/.test(clean)) return setProblem('The reference has only letters and numbers, 6 to 30 of them. Copy it from your UPI app or bank message.');
    setProblem(null);
    setBusy(true);
    try {
      await onPaid(clean);
      toast.success('Payment reference sent. The seller will check it.');
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not send the reference. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>;
  if (details === undefined) return <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the seller’s payment details…</p>;
  if (details === null) return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">The seller has not added a bank account or UPI ID yet. Call the seller and ask them to add it in their portal.</p>;

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-orange-200">
      <div>
        <p className="text-sm font-semibold text-slate-700">Pay the seller this amount</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="text-3xl font-bold tabular-nums text-slate-900">{inr(amount)}</p>
          <button type="button" onClick={() => void copy(String(amount), 'Amount')} aria-label="Copy amount" className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-slate-50 px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
            <Copy className="h-4 w-4" aria-hidden /> Copy
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">The money goes straight to the seller. KashRoot does not hold it.</p>
      </div>

      {details.upi_id && (
        <div className="flex flex-wrap items-start gap-4">
          <a href={upiLink({ upi: details.upi_id, name: details.account_name, amount, note })} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold no-underline shadow-sm hover:no-underline ${theme.solid}`}>
            <Smartphone className="h-5 w-5" aria-hidden /> Pay by UPI app
          </a>
          <UpiQr upi={details.upi_id} name={details.account_name} amount={amount} note={note} caption="On another phone? Scan this with any UPI app. The amount is filled in." />
        </div>
      )}

      <div className="rounded-xl bg-slate-50/70 px-3 ring-1 ring-slate-200">
        <Row label="Account holder name" value={details.account_name} />
        {details.account_number && <Row label="Account number" value={details.account_number} mono />}
        {details.ifsc && <Row label="IFSC" value={details.ifsc} mono />}
        {details.bank_name && <Row label="Bank" value={details.bank_name} />}
        {details.upi_id && <Row label="UPI ID" value={details.upi_id} mono />}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-800" htmlFor={`utr-${orderId}`}>
          {paidRef ? 'Paid again, or the reference was wrong? Write the payment reference (UTR)' : 'After paying, write the payment reference (UTR)'}
        </label>
        <p className="text-xs text-slate-500">Your UPI app or bank message shows it. For UPI it is a 12-digit number.</p>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input id={`utr-${orderId}`} className={`${INPUT} min-h-11 font-mono`} inputMode="text" autoComplete="off" value={ref} onChange={(e) => { setRef(e.target.value); setProblem(null); }} placeholder="e.g. 412345678901" />
          <Btn theme={theme} className="min-h-11 shrink-0" disabled={busy} onClick={() => void submit()}>{busy ? 'Sending…' : 'I have paid'}</Btn>
        </div>
        {problem && <p role="alert" className="mt-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{problem}</p>}
      </div>
    </div>
  );
}
