'use client';

/**
 * The lab's part of the Business admin (a business of kind "soil_lab"): its details (where it is, which districts it
 * serves, whether it visits fields), its tests and prices, and the requests farmers send: accept with the day and time
 * the lab will come, say the sample was collected, upload the report (values, remarks and the lab's own file) or decline
 * with a reason. The owner or a manager changes details and prices; staff take requests and upload reports. Each step
 * emails the farmer (20261128000000_soil_lab_tests.sql).
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, ClipboardList, FileUp, FlaskConical, Loader2, MapPin, Phone, Plus, Settings, Trash2, X } from 'lucide-react';

import { Badge, Btn, Field, INPUT, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import { inr } from '@/lib/db/client';
import {
  addLabReport, dayText, fileProblem, kindLabel, labMine, labRequests, LAB_STATUS_LABEL, MAX_FILE_BYTES, readFileAsDataUrl, SAMPLE_KINDS, saveLabProfile, saveLabTest, setLabStatus, slotLabel, USUAL_SOIL_VALUES, visitText,
  type LabProfile, type LabRequest, type LabStatus, type LabTest, type ResultRow, type SampleKind,
} from '@/lib/db/lab';
import { JK_DISTRICTS } from '@/lib/coldStore';

const theme = PORTAL_THEMES.seller;
const TONE: Record<LabStatus, 'amber' | 'blue' | 'green' | 'red' | 'slate'> = { requested: 'amber', accepted: 'blue', sample_collected: 'blue', report_ready: 'green', declined: 'red', cancelled: 'slate' };
const DONE: LabStatus[] = ['report_ready', 'declined', 'cancelled'];
/** The time a lab is most likely to come, for the part of the day the farmer asked for (it can be changed). */
const suggested = (date: string, slot: string) => `${date}T${slot === 'afternoon' ? '14:00' : slot === 'evening' ? '17:00' : '10:00'}`;

export function LabConsole({ orgId, role, suspended }: { orgId: string; role: 'owner' | 'manager' | 'staff'; suspended: boolean }) {
  const manage = role !== 'staff';
  const [section, setSection] = useState<'requests' | 'tests' | 'details'>('requests');
  const [mine, setMine] = useState<{ profile: LabProfile | null; tests: LabTest[] } | null>(null);
  const [requests, setRequests] = useState<LabRequest[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([labMine(orgId), labRequests(orgId)]);
      setMine(m);
      setRequests(r);
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not load the lab.');
    }
  }, [orgId]);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    // New requests arrive by themselves (checked every 30 seconds while the page is seen).
    const tick = () => {
      if (live && document.visibilityState === 'visible') void load();
    };
    const id = window.setInterval(tick, 30_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [load]);

  const todo = (requests ?? []).filter((r) => !DONE.includes(r.status));
  const fresh = (requests ?? []).filter((r) => r.status === 'requested').length;
  const ready = mine?.profile && mine.tests.some((t) => t.active);

  return (
    <section data-business-lab className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold"><FlaskConical className="h-5 w-5 text-forest" aria-hidden /> Soil and lab testing</h3>
      {problem && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">{problem}</p>}
      {mine && !ready && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          Farmers can find your lab once you have filled in <strong>Lab details</strong> (where you are and the districts you serve) and added at least one test with its price under <strong>Tests and prices</strong>.
        </p>
      )}
      <div role="group" aria-label="Lab sections" className="flex flex-wrap gap-2">
        {([['requests', `Requests${fresh ? ` (${fresh} new)` : todo.length ? ` (${todo.length})` : ''}`, ClipboardList], ['tests', 'Tests and prices', FlaskConical], ['details', 'Lab details', Settings]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)} className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-4 text-sm font-semibold ring-2 transition ${section === id ? 'bg-forest text-white ring-forest' : 'bg-white text-forest ring-forest-line hover:bg-forest-soft'}`}>
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {mine === null || requests === null ? (
        problem ? null : <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
      ) : section === 'requests' ? (
        <Requests requests={requests} suspended={suspended} onChanged={() => void load()} />
      ) : section === 'tests' ? (
        <Tests orgId={orgId} tests={mine.tests} manage={manage && !suspended} onChanged={() => void load()} />
      ) : (
        <Details orgId={orgId} profile={mine.profile} manage={manage && !suspended} onChanged={() => void load()} />
      )}
    </section>
  );
}

// ── requests ──
function Requests({ requests, suspended, onChanged }: { requests: LabRequest[]; suspended: boolean; onChanged: () => void }) {
  const [show, setShow] = useState<'todo' | 'done'>('todo');
  const [reporting, setReporting] = useState<LabRequest | null>(null);
  const list = requests.filter((r) => (show === 'todo' ? !DONE.includes(r.status) : DONE.includes(r.status)));
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Which requests" className="flex gap-2">
        {([['todo', 'To do'], ['done', 'Finished']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={show === id} onClick={() => setShow(id)} className={`min-h-11 cursor-pointer rounded-lg px-3 text-sm font-semibold ring-1 ${show === id ? 'bg-forest-soft text-forest-deep ring-forest' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">{show === 'todo' ? 'No request waiting. A farmer’s booking appears here, and you get an email.' : 'Nothing finished yet.'}</p>
      ) : (
        <ul className="!list-none space-y-3 !pl-0">
          {list.map((r) => <RequestCard key={r.id} r={r} suspended={suspended} onChanged={onChanged} onReport={() => setReporting(r)} />)}
        </ul>
      )}
      {reporting && <ReportForm request={reporting} onClose={() => setReporting(null)} onDone={() => { setReporting(null); onChanged(); }} />}
    </div>
  );
}

function RequestCard({ r, suspended, onChanged, onReport }: { r: LabRequest; suspended: boolean; onChanged: () => void; onReport: () => void }) {
  const [when, setWhen] = useState(() => (r.scheduled_for ? new Date(new Date(r.scheduled_for).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : suggested(r.preferred_date, r.preferred_slot)));
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (status: 'accepted' | 'sample_collected' | 'declined', message: string) => {
    setBusy(true);
    try {
      await setLabStatus(r.id, status, status === 'accepted' ? new Date(when).toISOString() : null, note.trim());
      toast.success(message);
      setDeclining(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the request.');
    } finally {
      setBusy(false);
    }
  };
  const maps = r.visit_lat !== null && r.visit_lng !== null ? `https://www.google.com/maps/search/?api=1&query=${r.visit_lat},${r.visit_lng}` : null;
  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-slate-900/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{r.test_name}</p>
          <p className="text-xs text-slate-600">{r.code} · {kindLabel(r.sample_kind)}{r.crop ? ` · ${r.crop}` : ''} · {inr(Number(r.price) + Number(r.visit_fee))}</p>
        </div>
        <Badge tone={TONE[r.status]}>{LAB_STATUS_LABEL[r.status]}</Badge>
      </div>
      <div className="mt-2 grid gap-1 text-sm text-slate-800 sm:grid-cols-2">
        <p className="flex items-center gap-1.5"><strong>{r.farmer_name}</strong> · {r.district}</p>
        <a href={`tel:+91${r.farmer_phone}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-forest-deep"><Phone className="h-4 w-4" aria-hidden /> {r.farmer_phone}</a>
        <p className="flex items-start gap-1.5 sm:col-span-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{r.visit_address}{maps && <> · <a href={maps} target="_blank" rel="noopener noreferrer" className="font-semibold text-forest-deep underline underline-offset-2">Open on the map</a></>}</span></p>
        <p>Wanted: {dayText(r.preferred_date)}, {slotLabel(r.preferred_slot).toLowerCase()}</p>
        {r.scheduled_for && <p><strong>Visit planned: {visitText(r.scheduled_for)}</strong></p>}
        {r.note && <p className="sm:col-span-2">Farmer says: {r.note}</p>}
        {r.lab_note && <p className="sm:col-span-2 text-slate-600">Your note: {r.lab_note}</p>}
      </div>

      {!suspended && (r.status === 'requested' || r.status === 'accepted') && (
        <div className="mt-3 space-y-2 rounded-xl bg-forest-soft p-3 ring-1 ring-forest-line">
          {!declining ? (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <Field label={r.status === 'requested' ? 'The day and time you will come' : 'Change the visit time'}>
                  <input type="datetime-local" className={`${INPUT} sm:w-64`} value={when} onChange={(e) => setWhen(e.target.value)} />
                </Field>
                <Btn theme={theme} icon={busy ? Loader2 : CalendarCheck} disabled={busy || !when} onClick={() => void act('accepted', 'Accepted. The farmer was told when you will come.')}>{r.status === 'requested' ? 'Accept and tell the farmer' : 'Save the new time'}</Btn>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status === 'accepted' && <Btn theme={theme} variant="soft" icon={CheckCircle2} disabled={busy} onClick={() => void act('sample_collected', 'Marked: sample collected.')}>Sample collected</Btn>}
                <Btn theme={theme} variant="ghost" icon={X} disabled={busy} onClick={() => setDeclining(true)}>Decline</Btn>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Field label="Why can you not take it? The farmer reads this." hint="At least 5 letters.">
                <textarea className={INPUT} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Btn theme={theme} icon={busy ? Loader2 : X} disabled={busy || note.trim().length < 5} onClick={() => void act('declined', 'Declined. The farmer was told.')}>Decline the request</Btn>
                <Btn theme={theme} variant="ghost" onClick={() => setDeclining(false)}>Back</Btn>
              </div>
            </div>
          )}
        </div>
      )}
      {!suspended && (r.status === 'accepted' || r.status === 'sample_collected' || r.status === 'report_ready') && (
        <div className="mt-3">
          <Btn theme={theme} variant={r.status === 'report_ready' ? 'soft' : undefined} icon={FileUp} onClick={onReport}>{r.has_report ? 'Replace the report' : 'Upload the report'}</Btn>
        </div>
      )}
    </li>
  );
}

// ── the report ──
const blank = (): ResultRow => ({ parameter: '', value: '', unit: '', rating: '' });

function ReportForm({ request, onClose, onDone }: { request: LabRequest; onClose: () => void; onDone: () => void }) {
  const [reportNo, setReportNo] = useState('');
  const [testedOn, setTestedOn] = useState(() => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10));
  const [rows, setRows] = useState<ResultRow[]>([blank(), blank(), blank()]);
  const [remarks, setRemarks] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (i: number, k: keyof ResultRow, v: string) => setRows((all) => all.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  // A name without a result is left out when uploading; a result without a name is not allowed.
  const filled = rows.filter((r) => r.parameter.trim() && r.value.trim()).length;
  const unnamed = rows.some((r) => r.value.trim() !== '' && r.parameter.trim() === '');
  const problem = unnamed ? 'Each result needs a name, for example “pH”.' : filled === 0 && !file ? 'Type at least one result, or attach the lab’s own file (PDF or photo).' : null;

  const pick = (f: File | null) => {
    if (!f) return setFile(null);
    const p = fileProblem(f);
    setFileError(p);
    setFile(p ? null : f);
  };
  const submit = async () => {
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      const data = file ? await readFileAsDataUrl(file) : null;
      await addLabReport(request.id, { reportNo: reportNo.trim(), testedOn, results: rows, remarks: remarks.trim(), fileName: file?.name ?? '', fileData: data });
      toast.success('Report uploaded. The farmer was told and can read it now.');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload the report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Report for ${request.code}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-600">{request.has_report ? 'This replaces the report already uploaded.' : 'The farmer is emailed when you upload.'}</p>
          <Btn theme={theme} icon={busy ? Loader2 : FileUp} disabled={busy} onClick={() => void submit()}>{busy ? 'Uploading…' : 'Upload the report'}</Btn>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-700"><strong>{request.test_name}</strong> for {request.farmer_name} ({request.district}). Type the values you measured, and/or attach your own report file.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your report number (optional)"><input className={INPUT} value={reportNo} onChange={(e) => setReportNo(e.target.value)} maxLength={40} /></Field>
          <Field label="Tested on"><input type="date" className={INPUT} value={testedOn} onChange={(e) => setTestedOn(e.target.value)} /></Field>
        </div>
        <div>
          <p className="text-sm font-medium text-ink">Values measured</p>
          <datalist id="lab-ratings">{['Low', 'Medium', 'High', 'Normal', 'Acidic', 'Neutral', 'Alkaline', 'Sufficient', 'Deficient'].map((w) => <option key={w} value={w} />)}</datalist>
          <ul className="mt-1 !list-none space-y-2 !pl-0">
            {rows.map((r, i) => (
              <li key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                <input aria-label={`Value ${i + 1} name`} className={`${INPUT} col-span-2 sm:col-span-1`} placeholder="Name, e.g. pH" value={r.parameter} maxLength={60} onChange={(e) => set(i, 'parameter', e.target.value)} />
                <input aria-label={`Value ${i + 1} result`} className={INPUT} placeholder="Result" value={r.value} maxLength={30} inputMode="decimal" onChange={(e) => set(i, 'value', e.target.value)} />
                <input aria-label={`Value ${i + 1} unit`} className={INPUT} placeholder="Unit" value={r.unit} maxLength={20} onChange={(e) => set(i, 'unit', e.target.value)} />
                <input aria-label={`Value ${i + 1} rating`} className={INPUT} placeholder="Rating" list="lab-ratings" value={r.rating} maxLength={20} onChange={(e) => set(i, 'rating', e.target.value)} />
                <button type="button" aria-label={`Remove value ${i + 1}`} onClick={() => setRows((all) => all.filter((_, j) => j !== i))} className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn theme={theme} variant="soft" icon={Plus} onClick={() => setRows((all) => [...all, blank()])}>Add a value</Btn>
            {request.sample_kind === 'soil' && (
              <Btn theme={theme} variant="ghost" onClick={() => setRows((all) => [...all.filter((r) => r.parameter.trim() || r.value.trim()), ...USUAL_SOIL_VALUES.filter((n) => !all.some((r) => r.parameter.trim().toLowerCase() === n.toLowerCase())).map((n) => ({ ...blank(), parameter: n }))])}>Add the usual soil values</Btn>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-600">“Add the usual soil values” adds the names only: you type the results, and a name left without a result is not sent.</p>
        </div>
        <Field label="Remarks for the farmer (optional)"><textarea className={INPUT} rows={3} maxLength={2000} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Organic carbon is low: add well-rotted FYM before the next spray." /></Field>
        <div>
          <label htmlFor="lab-file" className="text-sm font-medium text-ink">Your own report file (PDF or photo, up to {Math.round(MAX_FILE_BYTES / 1_000_000)} MB)</label>
          <input id="lab-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border-0 file:bg-forest-soft file:px-4 file:font-semibold file:text-forest-deep" />
          {file && <p className="mt-1 text-xs text-slate-600">{file.name} · {(file.size / 1000).toFixed(0)} KB</p>}
          {fileError && <p role="alert" className="mt-1 text-sm text-rose-800">{fileError}</p>}
        </div>
        {problem && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">{problem}</p>}
      </div>
    </Modal>
  );
}

// ── tests and prices ──
function Tests({ orgId, tests, manage, onChanged }: { orgId: string; tests: LabTest[]; manage: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<LabTest | 'new' | null>(null);
  return (
    <div className="space-y-3">
      {!manage && <p className="text-sm text-slate-600">Only the owner or a manager changes tests and prices.</p>}
      {tests.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">No test yet. Add what you test and what you charge, for example “Soil: pH, EC, organic carbon, N, P, K”.</p>
      ) : (
        <ul className="!list-none divide-y divide-slate-100 rounded-2xl bg-white !pl-0 ring-1 ring-slate-900/10">
          {tests.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{t.name} {!t.active && <Badge tone="slate">Hidden from farmers</Badge>}</p>
                <p className="text-xs text-slate-600">{kindLabel(t.sample_kind)} · report in {t.days} day{t.days === 1 ? '' : 's'} · {inr(t.price)}{Number(t.visit_fee) > 0 ? ` + ${inr(t.visit_fee)} visit` : ''}</p>
              </div>
              {manage && <Btn theme={theme} variant="soft" onClick={() => setEditing(t)}>Change</Btn>}
            </li>
          ))}
        </ul>
      )}
      {manage && <Btn theme={theme} icon={Plus} onClick={() => setEditing('new')}>Add a test</Btn>}
      {editing && <TestForm orgId={orgId} test={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </div>
  );
}

function TestForm({ orgId, test, onClose, onSaved }: { orgId: string; test: LabTest | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(test?.name ?? '');
  const [sample, setSample] = useState<SampleKind>(test?.sample_kind ?? 'soil');
  const [price, setPrice] = useState(test ? String(test.price) : '');
  const [visit, setVisit] = useState(test ? String(test.visit_fee) : '0');
  const [days, setDays] = useState(test ? String(test.days) : '5');
  const [active, setActive] = useState(test?.active ?? true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveLabTest(orgId, { id: test?.id ?? null, name: name.trim(), sample, price: Number(price), visitFee: Number(visit || 0), days: Number(days), active });
      toast.success('Saved.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={test ? 'Change the test' : 'Add a test'} footer={<div className="flex w-full justify-end"><Btn theme={theme} icon={busy ? Loader2 : CheckCircle2} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Btn></div>}>
      <div className="space-y-3">
        <Field label="Name of the test" hint="What it measures, in words a farmer knows."><input className={INPUT} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Soil: pH, EC, organic carbon, N, P, K" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What is tested"><select className={INPUT} value={sample} onChange={(e) => setSample(e.target.value as SampleKind)}>{SAMPLE_KINDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
          <Field label="Days until the report"><input className={INPUT} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
          <Field label="Price of the test (₹)"><input className={INPUT} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="Visit fee (₹)" hint="For coming to the field. 0 if none."><input className={INPUT} inputMode="decimal" value={visit} onChange={(e) => setVisit(e.target.value)} /></Field>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActive(e.target.checked)} /> Show this test to farmers</label>
      </div>
    </Modal>
  );
}

// ── lab details ──
function Details({ orgId, profile, manage, onChanged }: { orgId: string; profile: LabProfile | null; manage: boolean; onChanged: () => void }) {
  const [districts, setDistricts] = useState<string[]>(profile?.districts ?? []);
  const [address, setAddress] = useState(profile?.address ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [homeVisit, setHomeVisit] = useState(profile?.home_visit ?? true);
  const [about, setAbout] = useState(profile?.about ?? '');
  const [busy, setBusy] = useState(false);
  const toggle = (d: string) => setDistricts((all) => (all.includes(d) ? all.filter((x) => x !== d) : [...all, d]));
  const save = async () => {
    setBusy(true);
    try {
      await saveLabProfile(orgId, { districts, address: address.trim(), phone: phone.trim().replace(/[^\d+ -]/g, ''), homeVisit, about: about.trim() });
      toast.success('Saved. Farmers in those districts can find your lab.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-900/10">
      {!manage && <p className="text-sm text-slate-600">Only the owner or a manager changes the lab’s details.</p>}
      <fieldset disabled={!manage} className="space-y-3">
        <legend className="text-sm font-medium text-ink">Districts you serve</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {JK_DISTRICTS.map((d) => (
            <label key={d} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-50"><input type="checkbox" className="h-5 w-5" checked={districts.includes(d)} onChange={() => toggle(d)} /> {d}</label>
          ))}
        </div>
        <Field label="Lab address"><textarea className={INPUT} rows={2} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Where farmers can find you" /></Field>
        <Field label="Lab phone" hint="Farmers see this number."><input className={INPUT} inputMode="tel" value={phone} maxLength={15} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ -]/g, ''))} /></Field>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={homeVisit} onChange={(e) => setHomeVisit(e.target.checked)} /> We come to the farmer’s field to take the sample</label>
        <Field label="About your lab (optional)"><textarea className={INPUT} rows={3} maxLength={600} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Years of work, what you are known for" /></Field>
      </fieldset>
      {manage && <Btn theme={theme} icon={busy ? Loader2 : CheckCircle2} disabled={busy || districts.length === 0 || address.trim().length < 5} onClick={() => void save()}>{busy ? 'Saving…' : 'Save the lab details'}</Btn>}
    </div>
  );
}
