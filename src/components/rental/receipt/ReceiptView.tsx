'use client';

/**
 * A cold store booking's receipt (/rental/receipt/<booking id>), which the
 * farmer shows to the cold store staff when they come with their apples:
 * who booked, which store, the chamber, floor and places in words, how many
 * bins or crates, the months, rent and total, the payment reference and
 * where it stands. Its QR code opens this same page, so the staff can scan
 * it: the owner, signed in, sees "This booking is in your store". Only the
 * farmer who booked and the store's owner can open it (kr_cold_receipt).
 * Prints on one page (Print / Save as PDF). It records what the farmer says
 * they paid directly to the owner and what the owner confirmed; KashRoot
 * does not hold or pass on money.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, CheckCircle2, Clock, Loader2, Phone, Printer, ShieldAlert, XCircle } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { QrImage } from '@/components/rental/receipt/QrImage';
import { Btn, PORTAL_THEMES } from '@/components/portal/kit';
import { countText } from '@/lib/coldStore';
import { inr } from '@/lib/db/client';
import { lastDay, placeLines, priceLines, type PlacedOn } from '@/lib/db/coldMap';
import { bookingAction, bookingCode, coldReceipt, type ColdReceipt } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Where the booking stands, in the words the farmer and the staff read. */
function standing(r: ColdReceipt): { text: string; tone: 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'violet'; Icon: typeof CheckCircle2 } {
  const b = r.booking;
  switch (b.status) {
    case 'confirmed':
      return { text: `Confirmed by the cold store owner${b.confirmed_at ? ` on ${day(b.confirmed_at)}` : ''}`, tone: 'green', Icon: BadgeCheck };
    case 'completed':
      return { text: `Completed: the owner confirmed it${b.confirmed_at ? ` on ${day(b.confirmed_at)}` : ''}, and the apples have been taken out`, tone: 'violet', Icon: BadgeCheck };
    case 'paid':
      return { text: 'Paid — waiting for the owner to confirm', tone: 'blue', Icon: Clock };
    case 'requested':
      return { text: 'Not paid yet', tone: 'amber', Icon: Clock };
    case 'rejected':
      return { text: 'Not accepted by the owner', tone: 'red', Icon: XCircle };
    default:
      return { text: 'Cancelled', tone: 'slate', Icon: XCircle };
  }
}

export function ReceiptView({ id }: { id: string }) {
  const [receipt, setReceipt] = useState<ColdReceipt | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The address the QR code opens: this receipt, on this site.
  const [here] = useState(() => (typeof window === 'undefined' ? '' : `${window.location.origin}/rental/receipt/${id}`));

  const load = useCallback(async () => {
    try {
      setReceipt(await coldReceipt(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the receipt.');
    }
  }, [id]);

  useEffect(() => {
    let live = true;
    void (async () => {
      if (live) await load();
    })();
    return () => {
      live = false;
    };
  }, [id, load]);

  const words = useMemo(() => {
    if (!receipt) return null;
    const chambers = [...new Map(receipt.places.map((p) => [p.chamber_id, { id: p.chamber_id, name: p.name, storage: p.storage, boxes_per_slot: p.boxes_per_slot, position: p.position }])).values()].sort((a, b) => a.position - b.position);
    const placed: PlacedOn[] = receipt.places.map((p) => ({ chamber_id: p.chamber_id, slot: p.slot, boxes: p.boxes }));
    const price = priceLines(
      receipt.places.map((p) => ({ chamber: { id: p.chamber_id, name: p.name, chamber_no: p.chamber_no, storage: p.storage, rate: null }, boxes: p.boxes, rate: p.rate })),
      receipt.store.rate,
      receipt.booking.months,
    );
    return { lines: placeLines(placed, chambers), price };
  }, [receipt]);

  const confirm = async () => {
    if (!receipt) return;
    if (!receipt.booking.payment_ref && !window.confirm('The farmer has not written a payment reference yet. Did the money reach your bank or UPI app?')) return;
    setBusy(true);
    try {
      await bookingAction(receipt.booking.id, 'confirm');
      toast.success('Booking confirmed. The places are the farmer’s.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not confirm the booking.');
    } finally {
      setBusy(false);
    }
  };

  const back = receipt?.viewer === 'owner' ? '/rental/dashboard?as=owner&tab=requests' : '/rental/dashboard?as=farmer&tab=bookings';
  const backLabel = receipt?.viewer === 'owner' ? 'Back to bookings' : 'Back to My bookings';

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>
        <Btn theme={theme} variant="soft" className="mt-4 min-h-[44px]" onClick={() => void load()}>Try again</Btn>
      </div>
    );
  }
  if (receipt === undefined) {
    return <p className="flex items-center gap-2 px-4 py-10 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the receipt…</p>;
  }
  if (receipt === null || !words) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-900/10">
          <p className="flex items-center gap-2 text-lg font-semibold text-slate-900"><ShieldAlert className="h-6 w-6 text-amber-600" aria-hidden /> You cannot open this receipt</p>
          <p className="mt-2 text-sm text-slate-700">Only the farmer who made this booking and the owner of the cold store can see its receipt. If you work at the cold store, sign in to Cold Storage Booking with the cold store owner’s account, then scan the code again.</p>
          <Btn theme={theme} href="/rental/dashboard" variant="soft" icon={ArrowLeft} className="mt-4 min-h-[44px]">Go to Cold Storage Booking</Btn>
        </div>
      </div>
    );
  }

  const { booking: b, store: s } = receipt;
  const st = standing(receipt);
  const kinds = [...new Set(words.lines.map((l) => l.storage))];
  const count = kinds.length ? words.lines.reduce((m, l) => m.set(l.storage, (m.get(l.storage) ?? 0) + l.count), new Map<string, number>()) : null;
  const countWords = count ? [...count].map(([k, n]) => countText(n, k as 'bins' | 'crates' | 'boxes')).join(' and ') : countText(b.units, 'boxes');
  const address = [s.address, s.area, s.district, s.state].filter(Boolean).join(', ');
  const paidTo = b.paid_to;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 print:max-w-none print:p-0">
      {/* Printing shows the receipt only: not the site's menus, nor these buttons. */}
      <style>{`@media print { body * { visibility: hidden !important; } #kr-receipt, #kr-receipt * { visibility: visible !important; } #kr-receipt { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; } @page { margin: 12mm; } }`}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        {/* A full page load, so the portal opens on the right side and tab. */}
        <a href={back} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-700 no-underline hover:bg-slate-900/5 hover:no-underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {backLabel}
        </a>
        <Btn theme={theme} icon={Printer} className="min-h-[44px]" onClick={() => window.print()}>Print / Save as PDF</Btn>
      </div>

      {receipt.viewer === 'owner' && (
        <div role="status" className={`mb-4 rounded-2xl p-4 ring-1 print:hidden ${b.status === 'confirmed' || b.status === 'completed' ? 'bg-emerald-50 text-emerald-950 ring-emerald-300' : b.status === 'paid' || b.status === 'requested' ? 'bg-sky-50 text-sky-950 ring-sky-300' : 'bg-slate-50 text-slate-800 ring-slate-300'}`}>
          <p className="flex items-center gap-2 text-lg font-bold">
            <BadgeCheck className="h-6 w-6" aria-hidden />
            {b.status === 'confirmed'
              ? 'This booking is in your store: confirmed'
              : b.status === 'completed'
                ? 'This booking is in your store: completed'
                : b.status === 'paid'
                  ? 'This booking is in your store: paid, waiting for you'
                  : b.status === 'requested'
                    ? 'This booking is in your store: not paid yet'
                    : `This booking is in your store: ${b.status === 'rejected' ? 'not accepted' : 'cancelled'}`}
          </p>
          {(b.status === 'paid' || b.status === 'requested') && (
            <>
              <p className="mt-1 text-sm">{b.payment_ref ? `The farmer says they paid, reference ${b.payment_ref}. Check the money in your bank or UPI app, then press Money received.` : 'The farmer has not written a payment reference yet.'}</p>
              <Btn theme={theme} icon={CheckCircle2} disabled={busy} className="mt-3 min-h-[48px]" onClick={() => void confirm()}>{busy ? 'Saving…' : 'Money received'}</Btn>
            </>
          )}
        </div>
      )}

      <article id="kr-receipt" aria-label="Cold storage receipt" className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-900/10 sm:p-7 print:rounded-none print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-slate-300 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">KashRoot · Cold storage receipt</p>
            <h1 className="mt-1 font-sans text-2xl font-bold text-slate-900">Receipt {bookingCode(b.id)}</h1>
            <p className="text-sm text-slate-600">Booked on {when(b.created_at)}</p>
          </div>
        </header>

        <p className={`mt-4 flex items-start gap-2 rounded-2xl p-3 text-base font-semibold ${st.tone === 'green' ? 'bg-emerald-50 text-emerald-900' : st.tone === 'blue' ? 'bg-sky-50 text-sky-900' : st.tone === 'amber' ? 'bg-amber-50 text-amber-900' : st.tone === 'red' ? 'bg-rose-50 text-rose-900' : 'bg-slate-50 text-slate-800'}`}>
          <st.Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {st.text}
        </p>
        {b.owner_note && <p className="mt-2 text-sm text-slate-700">Owner’s note: {b.owner_note}</p>}

        <section className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Farmer</h2>
            <p className="mt-1 font-semibold text-slate-900">{b.farmer_name}</p>
            <p className="text-slate-700">Mobile {b.farmer_phone}</p>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cold store</h2>
            <p className="mt-1 font-semibold text-slate-900">{s.title}</p>
            <p className="text-slate-700">{address}</p>
            <p className="mt-1 text-slate-700">
              Owner {s.owner_name}: <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 font-semibold text-emerald-800"><Phone className="h-3.5 w-3.5 print:hidden" aria-hidden />{s.phone}</a>
            </p>
            {s.manager_phone && (
              <p className="text-slate-700">
                Manager{s.manager_name ? ` ${s.manager_name}` : ''}: <a href={`tel:${s.manager_phone}`} className="inline-flex items-center gap-1 font-semibold text-emerald-800"><Phone className="h-3.5 w-3.5 print:hidden" aria-hidden />{s.manager_phone}</a>
              </p>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 print:bg-white">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Space booked</h2>
          <p className="mt-1 text-xl font-bold text-slate-900">{countWords}</p>
          <p className="text-slate-800">From {day(b.start)} to {day(lastDay(b.start, b.months))} ({b.months} month{b.months === 1 ? '' : 's'})</p>
          {words.lines.length > 0 && (
            <ul className="mt-2 space-y-1 text-slate-900" aria-label="Places">
              {words.lines.map((l) => (
                <li key={l.chamberId} className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-semibold">{l.text}</span>
                  <span className="text-slate-700">{countText(l.count, l.storage)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rent</h2>
          <table className="mt-1 w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {words.price.lines.length > 0 ? (
                words.price.lines.map((l) => (
                  <tr key={l.key}>
                    <td className="py-1.5 pr-2 text-slate-800">{l.name}: {countText(l.count, l.storage)} × {inr(l.rate)} a month × {b.months}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">{inr(l.amount)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-1.5 pr-2 text-slate-800">{countWords} × {inr(s.rate)} a month × {b.months}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">{inr(b.amount)}</td>
                </tr>
              )}
              <tr>
                <td className="py-2 pr-2 text-base font-bold text-slate-900">Total</td>
                <td className="py-2 text-right text-xl font-bold tabular-nums text-slate-900" data-testid="receipt-total">{inr(b.amount)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mt-4 grid gap-1 text-sm text-slate-800">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment</h2>
          <p>Payment reference: <strong className="font-mono">{b.payment_ref ?? 'not given yet'}</strong>{b.paid_at ? ` · given on ${when(b.paid_at)}` : ''}</p>
          {paidTo && (
            <p>
              Paid to {paidTo.name}
              {paidTo.account_end ? ` · bank account ending ${paidTo.account_end}${paidTo.ifsc ? ` (${paidTo.ifsc})` : ''}` : ''}
              {paidTo.upi ? ` · UPI ${paidTo.upi}` : ''}
            </p>
          )}
          {b.confirmed_at && <p>Confirmed by the owner on {when(b.confirmed_at)}</p>}
        </section>

        <footer className="mt-5 flex flex-col items-center gap-4 border-t border-dashed border-slate-300 pt-4 sm:flex-row sm:items-start">
          {here && <QrImage text={here} size={140} alt={`QR code that opens receipt ${bookingCode(b.id)} on KashRoot`} caption="Cold store staff: scan to check this receipt on KashRoot." />}
          <p className="text-xs text-slate-600">
            This receipt records what the farmer says they paid directly to the cold store owner, and whether the owner confirmed it. KashRoot does not hold or pass on any money. Show this receipt to the cold store staff when you bring your apples. Scanning the code opens this receipt on KashRoot for the farmer and the cold store owner only.
          </p>
        </footer>
      </article>
    </div>
  );
}
