'use client';

/**
 * Paying the cold store owner for a booking, straight from the farmer to
 * the owner: the owner's account holder name, account number, IFSC and bank
 * (for a bank transfer) and UPI ID, each with a Copy button, the exact
 * amount, a "Pay by UPI app" button and a UPI QR when the owner has a UPI
 * ID. Then "I have paid" and the payment reference (UTR) from the bank or
 * UPI app; the owner checks the money and confirms. KashRoot never holds the
 * money (kr_payment_details shows the details only to the farmer who
 * booked, while the booking is live).
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Landmark, Loader2, Phone, Smartphone } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { QrImage } from '@/components/rental/receipt/QrImage';
import { Btn, PORTAL_THEMES } from '@/components/portal/kit';
import { bankOf } from '@/lib/coldStore';
import { inr } from '@/lib/db/client';
import { bookingAction, bookingCode, cleanRef, paymentDetails, paymentRefProblem, upiLink, type PayoutAccount } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;

/** Copy text, also where the clipboard is not allowed (an older phone browser). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand('copy');
      area.remove();
      return done;
    } catch {
      return false;
    }
  }
}

/** One detail to type into the bank or UPI app, with its own Copy button. */
export function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const copy = async () => {
    if (await copyText(value)) toast.success(`${label} copied`);
    else toast.error(`Could not copy. Press and hold on the ${label.toLowerCase()} to copy it.`);
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className={`break-all text-base font-semibold text-slate-900 ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100 print:hidden"
      >
        <Copy className="h-4 w-4" aria-hidden /> Copy
      </button>
    </div>
  );
}

export function PayOwner({
  bookingId,
  amount,
  owner,
  paidRef,
  onPaid,
}: {
  bookingId: string;
  /** What the database priced the booking at. */
  amount: number;
  /** The store's owner, to call when they have not added payment details. */
  owner: { name: string; phone: string };
  /** The reference the farmer already gave (status paid): they may correct it. */
  paidRef?: string | null;
  /** Called once the payment reference is saved. */
  onPaid: (ref: string) => void;
}) {
  const [details, setDetails] = useState<PayoutAccount | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  // "I have paid" opens the box for the payment reference.
  const [paying, setPaying] = useState(false);
  const [ref, setRef] = useState('');
  const [tried, setTried] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const code = bookingCode(bookingId);

  useEffect(() => {
    let live = true;
    paymentDetails('booking', bookingId)
      .then((d) => live && setDetails(d))
      .catch((err) => live && setLoadError(err instanceof Error ? err.message : 'Could not load the owner’s payment details.'));
    return () => {
      live = false;
    };
  }, [bookingId]);

  const problem = tried ? paymentRefProblem(ref) : null;
  const save = async () => {
    setTried(true);
    setSaveError(null);
    if (paymentRefProblem(ref)) return;
    const clean = cleanRef(ref).toUpperCase();
    setBusy(true);
    try {
      await bookingAction(bookingId, 'pay', clean);
      toast.success('Payment reference saved. The owner will check the money and confirm.');
      onPaid(clean);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the payment reference. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{loadError}</p>;
  if (details === undefined) return <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the owner’s payment details…</p>;

  const bank = details?.bank_name?.trim() || (details?.ifsc ? bankOf(details.ifsc) : null);
  const upi = details?.upi_id ?? null;
  const link = upi ? upiLink({ upi, name: details!.account_name, amount, note: code }) : null;

  return (
    <section aria-label="Pay the owner" className="space-y-4">
      <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
        <p className="text-sm font-semibold text-emerald-950">Pay the owner directly. KashRoot does not hold your money.</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-emerald-900">Amount to pay</p>
            <p className="text-3xl font-bold tabular-nums text-slate-900" data-testid="pay-amount">{inr(amount)}</p>
          </div>
          <button
            type="button"
            onClick={() => void copyText(String(Math.round(amount * 100) / 100)).then((done) => (done ? toast.success('Amount copied') : toast.error('Could not copy the amount.')))}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-300 hover:bg-emerald-100"
          >
            <Copy className="h-4 w-4" aria-hidden /> Copy amount
          </button>
        </div>
        <p className="mt-2 text-sm text-emerald-950">Booking number: <strong className="font-mono">{code}</strong>. Write it in the payment note, so the owner knows the money is for you.</p>
      </div>

      {!details ? (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">
          <p>The owner has not added a bank account or UPI ID yet. Call the owner and ask where to pay.</p>
          <a href={`tel:${owner.phone}`} className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 font-semibold text-emerald-800 ring-1 ring-emerald-200">
            <Phone className="h-4 w-4" aria-hidden /> Call {owner.name}
          </a>
        </div>
      ) : (
        <>
          {details.account_number && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="flex items-center gap-2 font-semibold text-slate-900"><Landmark className="h-5 w-5 text-emerald-700" aria-hidden /> Pay to the bank account (NEFT, IMPS or at the bank)</p>
              <div className="mt-1 divide-y divide-slate-100">
                <CopyRow label="Account holder name" value={details.account_name} mono={false} />
                <CopyRow label="Account number" value={details.account_number} />
                {details.ifsc && <CopyRow label="IFSC" value={details.ifsc} />}
                {bank && <CopyRow label="Bank" value={bank} mono={false} />}
              </div>
            </div>
          )}
          {upi && link && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="flex items-center gap-2 font-semibold text-slate-900"><Smartphone className="h-5 w-5 text-emerald-700" aria-hidden /> {details.account_number ? 'Or pay by UPI' : 'Pay by UPI'}</p>
              <div className="mt-1 divide-y divide-slate-100">
                {!details.account_number && <CopyRow label="Name" value={details.account_name} mono={false} />}
                <CopyRow label="UPI ID" value={upi} />
              </div>
              <a href={link} className={`mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold no-underline shadow-sm hover:no-underline sm:w-auto ${theme.solid}`}>
                <Smartphone className="h-5 w-5" aria-hidden /> Pay {inr(amount)} by UPI app
              </a>
              <div className="mt-3 flex justify-center sm:justify-start">
                <QrImage text={link} alt={`UPI QR code to pay ${inr(amount)} to ${details.account_name} (${upi})`} caption="On another phone? Scan this with any UPI app. The amount is filled in." />
              </div>
            </div>
          )}
        </>
      )}

      <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
        {paidRef && !paying ? (
          <div className="space-y-2 text-sm text-sky-950">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-700" aria-hidden /> You said you paid. Payment reference: <span className="font-mono">{paidRef}</span></p>
            <p>The owner will check the money in their bank or UPI app and confirm.</p>
            <button type="button" onClick={() => { setPaying(true); setRef(paidRef); }} className="min-h-[44px] cursor-pointer rounded-xl px-2 font-semibold text-sky-800 underline">Wrong number? Change it</button>
          </div>
        ) : !paying ? (
          <>
            <p className="text-sm text-sky-950">After you pay, your bank or UPI app shows a payment reference (UTR or transaction number). You will write it here.</p>
            <Btn theme={theme} icon={CheckCircle2} className="mt-3 min-h-[48px] w-full text-base sm:w-auto" onClick={() => setPaying(true)}>I have paid</Btn>
          </>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label htmlFor={`ref-${bookingId}`} className="block text-sm font-semibold text-slate-900">Payment reference (UTR or transaction number)</label>
            <p className="text-xs text-slate-600">Your bank or UPI app shows it after you pay. A UPI reference has 12 digits, like 412345678901.</p>
            <input
              id={`ref-${bookingId}`}
              className="block min-h-[48px] w-full rounded-xl border-0 bg-white px-3 font-mono text-base tracking-wide text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-600"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              aria-invalid={Boolean(problem)}
            />
            {(problem || saveError) && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{problem ?? saveError}</p>}
            <div className="flex flex-wrap gap-2">
              <Btn theme={theme} type="submit" icon={CheckCircle2} disabled={busy} className="min-h-[48px] text-base">{busy ? 'Saving…' : 'Save payment reference'}</Btn>
              <Btn theme={theme} variant="ghost" className="min-h-[48px]" onClick={() => { setPaying(false); setTried(false); setSaveError(null); }}>Back</Btn>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
