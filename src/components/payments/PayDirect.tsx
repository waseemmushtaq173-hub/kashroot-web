'use client';

/**
 * Pay the other side directly (no escrow): shows their UPI ID / bank details
 * for a booking or order, opens the phone's UPI app with the amount filled
 * in, and records the payment reference (UTR) the app shows afterwards.
 */
import { useEffect, useState } from 'react';
import { Copy, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { Btn, INPUT, type PortalTheme } from '@/components/portal/kit';
import { inr } from '@/lib/db/client';
import { paymentDetails, upiLink, type PayoutAccount } from '@/lib/db/rentals';

export function PayDirect({
  kind,
  id,
  amount,
  note,
  theme,
  onPaid,
}: {
  kind: 'booking' | 'order';
  id: string;
  amount: number;
  note: string;
  theme: PortalTheme;
  /** Records the reference; throws with a message when it is refused. */
  onPaid: (ref: string) => Promise<void>;
}) {
  const [details, setDetails] = useState<PayoutAccount | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    paymentDetails(kind, id)
      .then((d) => live && setDetails(d))
      .catch((err) => live && setError(err instanceof Error ? err.message : 'Could not load payment details.'));
    return () => {
      live = false;
    };
  }, [kind, id]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy — select it and copy.');
    }
  };

  const submit = async () => {
    const clean = ref.replace(/\s/g, '');
    if (!/^[A-Za-z0-9]{6,30}$/.test(clean)) return toast.error('Enter the UPI reference / UTR number from your payment app (usually 12 digits).');
    setBusy(true);
    try {
      await onPaid(clean);
      toast.success('Payment recorded — the owner will confirm it');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record the payment.');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p role="alert" className="text-sm text-rose-700">{error}</p>;
  if (details === undefined) return <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading payment details…</p>;
  if (details === null) return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">The owner has not added a UPI ID or bank account yet. Call them to arrange payment.</p>;

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm text-slate-700">
        Pay <strong className="text-lg text-slate-900">{inr(amount)}</strong> directly to <strong className="text-slate-900">{details.account_name}</strong>. KashRoot does not hold this money.
      </p>
      {details.upi_id && (
        <div className="flex flex-wrap items-center gap-2">
          <a href={upiLink({ upi: details.upi_id, name: details.account_name, amount, note })} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold no-underline shadow-sm hover:no-underline ${theme.solid}`}>
            <Smartphone className="h-4 w-4" aria-hidden /> Pay with UPI app
          </a>
          <button type="button" onClick={() => void copy(details.upi_id!)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800 ring-1 ring-slate-200 hover:bg-slate-100">
            {details.upi_id} <Copy className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
      {details.account_number && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">Account</dt>
          <dd className="font-mono text-slate-900">{details.account_number}</dd>
          <dt className="text-slate-500">IFSC</dt>
          <dd className="font-mono text-slate-900">{details.ifsc}</dd>
          {details.bank_name && (
            <>
              <dt className="text-slate-500">Bank</dt>
              <dd className="text-slate-900">{details.bank_name}</dd>
            </>
          )}
        </dl>
      )}
      <div>
        <label className="block text-sm font-semibold text-slate-800" htmlFor={`utr-${id}`}>After paying, enter the reference number (UTR)</label>
        <div className="mt-1.5 flex gap-2">
          <input id={`utr-${id}`} className={INPUT} inputMode="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 412345678901" />
          <Btn theme={theme} disabled={busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'I have paid'}</Btn>
        </div>
      </div>
    </div>
  );
}
