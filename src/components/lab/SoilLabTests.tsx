'use client';

/**
 * Soil and lab tests, for the farmer (Farmer portal → Soil & lab tests): find a lab that serves your district, book a
 * test (what, where to come, which day), and follow it: accepted with a visit time, sample collected, report ready.
 * The lab is told by email the moment you book; you are told on each step. The report is read here and can be sent to
 * an expert. The price is paid to the lab directly: KashRoot does not take the money.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, FlaskConical, Loader2, LocateFixed, MapPin, Phone, Truck, X } from 'lucide-react';

import { LabReportView } from '@/components/lab/LabReportView';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, Panel, PORTAL_THEMES } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import { inr, type Account } from '@/lib/db/client';
import {
  bookLabTest, cancelLabBooking, dayText, kindLabel, labDirectory, LAB_STATUS_LABEL, LabNotSetUp, myLabBookings, SLOTS, slotLabel, totalFee, visitText,
  type LabListing, type LabStatus, type LabTest, type MyBooking, type Slot,
} from '@/lib/db/lab';
import { JK_DISTRICTS } from '@/lib/coldStore';

const theme = PORTAL_THEMES.farmer;
const TONE: Record<LabStatus, 'amber' | 'blue' | 'green' | 'red' | 'slate'> = { requested: 'amber', accepted: 'blue', sample_collected: 'blue', report_ready: 'green', declined: 'red', cancelled: 'slate' };

/** Today in India as YYYY-MM-DD, and a number of days after it. */
const indiaDay = (plus = 0) => new Date(Date.now() + 5.5 * 3600_000 + plus * 86_400_000).toISOString().slice(0, 10);
const digits = (v: string) => v.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

export function SoilLabTests({ account }: { account: Account | null | undefined }) {
  const [view, setView] = useState<'book' | 'mine'>('book');
  // null: not chosen yet, so the farmer's own district (My details) is used.
  const [districtPick, setDistrictPick] = useState<string | null>(null);
  const district = districtPick ?? JK_DISTRICTS.find((d) => d.toLowerCase() === (account?.district ?? '').toLowerCase()) ?? '';
  const [labs, setLabs] = useState<LabListing[] | null>(null);
  const [mine, setMine] = useState<MyBooking[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [booking, setBooking] = useState<{ lab: LabListing; test: LabTest } | null>(null);
  const [reading, setReading] = useState<MyBooking | null>(null);

  const loadLabs = useCallback(async () => {
    try {
      setLabs(await labDirectory(district || null));
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof LabNotSetUp || e instanceof Error ? e.message : 'Could not load the labs.');
    }
  }, [district]);
  const loadMine = useCallback(async () => {
    try {
      setMine(await myLabBookings());
    } catch (e) {
      setMine([]);
      if (e instanceof LabNotSetUp) setProblem(e.message);
    }
  }, []);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await loadLabs();
    };
    void run();
    return () => {
      live = false;
    };
  }, [loadLabs]);
  // The list follows the lab's steps by itself (checked every 30 seconds while the page is seen).
  useEffect(() => {
    let live = true;
    const first = async () => {
      if (live) await loadMine();
    };
    void first();
    const tick = () => {
      if (document.visibilityState === 'visible') void loadMine();
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      live = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [loadMine]);

  const open = (mine ?? []).filter((b) => b.status === 'requested' || b.status === 'accepted' || b.status === 'sample_collected').length;
  const ready = (mine ?? []).filter((b) => b.status === 'report_ready').length;

  return (
    <div className="space-y-4">
      <Panel theme={theme} title="Soil and lab tests" icon={FlaskConical}>
        <p className="text-sm text-slate-700">A lab comes to your field, takes the sample and puts the report here.</p>
        <ol className="mt-3 grid gap-2 text-sm text-slate-800 sm:grid-cols-4">
          {['Choose a lab and a test', 'Say where and which day', 'The lab visits and takes the sample', 'Read the report; ask an expert'].map((t, i) => (
            <li key={t} className="flex items-start gap-2 rounded-xl bg-forest-soft p-3 ring-1 ring-forest-line"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-forest text-xs font-bold text-white">{i + 1}</span>{t}</li>
          ))}
        </ol>
        <div role="group" aria-label="Soil and lab tests" className="mt-4 flex flex-wrap gap-2">
          {([['book', 'Book a test'], ['mine', `My tests${mine?.length ? ` (${mine.length})` : ''}`]] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold ring-2 transition ${view === id ? 'bg-forest text-white ring-forest' : 'bg-white text-forest ring-forest-line hover:bg-forest-soft'}`}>{label}</button>
          ))}
        </div>
        {(open > 0 || ready > 0) && view === 'book' && (
          <p className="mt-3 text-sm text-slate-700">
            {open > 0 && <>You have <strong>{open}</strong> test{open === 1 ? '' : 's'} in progress. </>}
            {ready > 0 && <><strong>{ready}</strong> report{ready === 1 ? ' is' : 's are'} ready to read. </>}
            <button type="button" onClick={() => setView('mine')} className="min-h-11 cursor-pointer font-semibold text-forest-deep underline underline-offset-2">See My tests</button>
          </p>
        )}
      </Panel>

      {problem && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">{problem}</p>}

      {view === 'book' ? (
        <Panel theme={theme} title="Labs that serve you" icon={MapPin}>
          <div className="max-w-xs">
            <Field label="Your district">
              <select value={district} onChange={(e) => setDistrictPick(e.target.value)} className={INPUT}>
                <option value="">All districts</option>
                {JK_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
          </div>
          {labs === null ? (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Looking for labs…</p>
          ) : labs.length === 0 ? (
            <div className="mt-4">
              <EmptyState theme={theme} icon={FlaskConical} title={district ? `No lab serves ${district} yet` : 'No lab has joined yet'} text="When a lab serves your district, it appears here." />
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {labs.map((lab) => (
                <li key={lab.org_id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-900/10">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-semibold text-slate-900">{lab.name}</h3>
                      <p className="flex items-start gap-1.5 text-sm text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {lab.address}</p>
                      <p className="text-xs text-slate-600">Serves {lab.districts.join(', ')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {lab.home_visit ? <Badge tone="green"><Truck className="h-3.5 w-3.5" aria-hidden /> Comes to your field</Badge> : <Badge tone="amber">Bring the sample to the lab</Badge>}
                      {lab.phone && <a href={`tel:${lab.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-forest-deep"><Phone className="h-4 w-4" aria-hidden /> {lab.phone}</a>}
                    </div>
                  </div>
                  {lab.about && <p className="mt-2 text-sm text-slate-700">{lab.about}</p>}
                  <ul className="mt-3 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                    {lab.tests.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{t.name}</p>
                          <p className="text-xs text-slate-600">{kindLabel(t.sample_kind)} · report in about {t.days} day{t.days === 1 ? '' : 's'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-right text-sm"><strong className="text-base">{inr(t.price)}</strong>{lab.home_visit && Number(t.visit_fee) > 0 && <span className="block text-xs text-slate-600">+ {inr(t.visit_fee)} visit</span>}</p>
                          <Btn theme={theme} icon={CalendarDays} onClick={() => setBooking({ lab, test: t })}>Book</Btn>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : (
        <Panel theme={theme} title="My tests" icon={FlaskConical}>
          {mine === null ? (
            <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
          ) : mine.length === 0 ? (
            <EmptyState theme={theme} icon={FlaskConical} title="No tests yet" text="Book a test with a lab near you. You will see every step here." action={<Btn theme={theme} onClick={() => setView('book')}>Book a test</Btn>} />
          ) : (
            <ul className="space-y-3">
              {mine.map((b) => (
                <MyTest key={b.id} b={b} onRead={() => setReading(b)} onChanged={() => void loadMine()} />
              ))}
            </ul>
          )}
        </Panel>
      )}

      {booking && (
        <BookingForm
          lab={booking.lab}
          test={booking.test}
          account={account}
          district={district}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            setView('mine');
            void loadMine();
          }}
        />
      )}

      <Modal open={reading !== null} onClose={() => setReading(null)} title={reading ? `Report ${reading.code}` : 'Report'} wide>
        {reading && <LabReportView bookingId={reading.id} canAsk asked={reading.asked_expert} onAsked={() => void loadMine()} />}
      </Modal>
    </div>
  );
}

function MyTest({ b, onRead, onChanged }: { b: MyBooking; onRead: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    if (!window.confirm('Cancel this test request? The lab is told.')) return;
    setBusy(true);
    try {
      await cancelLabBooking(b.id);
      toast.success('The request was cancelled.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-slate-900/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{b.test_name}</p>
          <p className="text-sm text-slate-600">{b.lab_name} · {kindLabel(b.sample_kind)}{b.crop ? ` · ${b.crop}` : ''}</p>
          <p className="text-xs text-slate-600">Booking {b.code} · wanted {dayText(b.preferred_date)}, {slotLabel(b.preferred_slot).toLowerCase()}</p>
        </div>
        <Badge tone={TONE[b.status]}>{LAB_STATUS_LABEL[b.status]}</Badge>
      </div>
      <div className="mt-2 space-y-1 text-sm text-slate-800">
        {b.status === 'requested' && <p>The lab has been told. It will accept and tell you which day and time it will come.</p>}
        {b.status === 'accepted' && <p><strong>The lab will come on {visitText(b.scheduled_for)}</strong> to: {b.visit_address}. Keep the place ready and your phone on.</p>}
        {b.status === 'sample_collected' && <p>The sample was collected. The report is on its way.</p>}
        {b.status === 'report_ready' && <p>The report is ready. {b.asked_expert ? 'You asked the experts about it.' : 'You can ask an expert about it.'}</p>}
        {b.status === 'declined' && <p>The lab could not take this request.</p>}
        {b.lab_note && <p className="rounded-lg bg-champagne-soft/60 p-2 text-sm ring-1 ring-champagne/50">The lab says: {b.lab_note}</p>}
        <p className="text-xs text-slate-600">Fee {inr(totalFee(b.price, b.visit_fee))} ({inr(b.price)} test{Number(b.visit_fee) > 0 ? ` + ${inr(b.visit_fee)} visit` : ''}), paid to the lab directly.</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {b.has_report && <Btn theme={theme} icon={CheckCircle2} onClick={onRead}>Read the report</Btn>}
        {b.lab_phone && b.status !== 'cancelled' && <a href={`tel:${b.lab_phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-forest-deep ring-1 ring-forest-line hover:bg-forest-soft"><Phone className="h-4 w-4" aria-hidden /> Call the lab</a>}
        {(b.status === 'requested' || b.status === 'accepted') && <Btn theme={theme} variant="ghost" icon={X} disabled={busy} onClick={() => void cancel()}>Cancel</Btn>}
      </div>
    </li>
  );
}

function BookingForm({ lab, test, account, district: districtNow, onClose, onBooked }: { lab: LabListing; test: LabTest; account: Account | null | undefined; district: string; onClose: () => void; onBooked: () => void }) {
  const first = lab.districts.find((d) => d.toLowerCase() === districtNow.toLowerCase()) ?? lab.districts.find((d) => d.toLowerCase() === (account?.district ?? '').toLowerCase()) ?? lab.districts[0] ?? '';
  const [name, setName] = useState(account?.name ?? '');
  const [phone, setPhone] = useState(digits(account?.phone ?? ''));
  const [district, setDistrict] = useState(first);
  const [crop, setCrop] = useState('');
  const [address, setAddress] = useState(account?.village ?? '');
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [date, setDate] = useState(indiaDay(2));
  const [slot, setSlot] = useState<Slot>('morning');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const fee = useMemo(() => totalFee(test.price, lab.home_visit ? test.visit_fee : 0), [test.price, test.visit_fee, lab.home_visit]);
  const problem =
    name.trim().length < 1 ? 'Write your name.'
    : !/^[6-9]\d{9}$/.test(digits(phone)) ? 'Write your 10-digit mobile number: the lab will call you.'
    : address.trim().length < 5 ? 'Write where the lab should come: the village, the orchard or field and a landmark.'
    : !date || date < indiaDay() ? 'Choose a day from today.'
    : null;

  const locate = () => {
    if (!navigator.geolocation) return toast.error('This phone cannot share its position. Write the place in words.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6, acc: Math.round(p.coords.accuracy) });
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error('The position could not be read. Allow location for KashRoot, or write the place in words.');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const submit = async () => {
    setTried(true);
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      await bookLabTest({ testId: test.id, name: name.trim(), phone: digits(phone), district, crop: crop.trim(), address: address.trim(), lat: pos?.lat ?? null, lng: pos?.lng ?? null, date, slot, note: note.trim() });
      toast.success('Booked. The lab has been told by email.');
      onBooked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not book the test.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Book: ${test.name}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700"><strong className="text-base">{inr(fee)}</strong> to the lab{lab.home_visit && Number(test.visit_fee) > 0 ? ` (${inr(test.price)} + ${inr(test.visit_fee)} visit)` : ''}</p>
          <Btn theme={theme} icon={busy ? Loader2 : CheckCircle2} disabled={busy} onClick={() => void submit()}>{busy ? 'Booking…' : 'Book this test'}</Btn>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="rounded-xl bg-forest-soft p-3 text-sm text-slate-800 ring-1 ring-forest-line">
          <strong>{lab.name}</strong>, {lab.address}. {lab.home_visit ? 'The lab comes to your place, takes the sample and uploads the report here.' : `This lab does not visit fields: take the sample to ${lab.address} on the day you choose.`} You pay the lab directly; KashRoot does not take the money.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your name"><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} /></Field>
          <Field label="Your mobile number" hint="The lab calls this number."><input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" autoComplete="tel" maxLength={14} placeholder="10 digits" /></Field>
          <Field label="District">
            <select className={INPUT} value={district} onChange={(e) => setDistrict(e.target.value)}>
              {lab.districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Crop (optional)"><input className={INPUT} value={crop} onChange={(e) => setCrop(e.target.value)} maxLength={60} placeholder="e.g. Apple" /></Field>
        </div>
        <Field label={lab.home_visit ? 'Where should the lab come?' : 'Where is the sample from?'} hint="Village, orchard or field, and a landmark.">
          <textarea className={INPUT} rows={2} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Orchard behind the mosque, Zainapora, Shopian" aria-invalid={tried && address.trim().length < 5} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Btn theme={theme} variant="soft" icon={locating ? Loader2 : LocateFixed} disabled={locating} onClick={locate}>{pos ? 'Update my position' : 'Use my phone’s position'}</Btn>
          {pos && <span className="text-xs text-slate-600">Position saved (within {pos.acc} m): the lab gets a map link.</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Which day?"><input type="date" className={INPUT} value={date} min={indiaDay()} max={indiaDay(60)} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Which part of the day?">
            <select className={INPUT} value={slot} onChange={(e) => setSlot(e.target.value as Slot)}>
              {SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Anything the lab should know (optional)"><textarea className={INPUT} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please call before you come. The road is narrow." /></Field>
        {tried && problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">{problem}</p>}
      </div>
    </Modal>
  );
}
