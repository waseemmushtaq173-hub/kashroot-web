'use client';

/**
 * The Kashmiri Lab — native speakers teach KashRoot's assistant proper
 * Kashmiri. Used in Admin → Kashmiri and on /koshur for Kashmiri editors.
 *
 *   Reports    answers people said were not proper Kashmiri: correct and save
 *   Words      Kashmiri words with every vowel mark, and their meaning
 *   Answers    example answers the assistant follows for similar questions
 *   Sentences  KashRoot's own fixed Kashmiri lines (buttons, "sorry" …)
 *   Editors    (admins) native speakers who may edit all of this
 *
 * Everything saved reaches the assistant within 5 minutes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenText, CheckCircle2, Flag, Languages, MessageSquareText, Pencil, Plus, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import { RefreshBtn } from '@/components/admin/RefreshBtn';
import { KashmiriKeys } from '@/components/kashmiri/KashmiriKeys';
import { Badge, Btn, EmptyState, Field, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import {
  addKsEditor,
  addKsExample,
  addKsWord,
  closeKsReport,
  deleteKsExample,
  deleteKsWord,
  fixKsReport,
  ksEditors,
  ksExamples,
  ksPhraseRows,
  ksReports,
  ksWords,
  removeKsEditor,
  resetKsPhrase,
  saveKsPhrase,
  updateKsExample,
  updateKsWord,
  type KsEditor,
  type KsExampleRow,
  type KsReport,
  type KsWordRow,
} from '@/lib/db/kashmiri';
import { KS_PHRASE_KEYS, KS_PHRASES, type KsPhraseKey } from '@/lib/kashmiri/phrases';
import { skeleton } from '@/lib/kashmiri/text';
import { publicOrigin } from '@/lib/site';

type Section = 'reports' | 'words' | 'answers' | 'sentences' | 'editors';

const theme = PORTAL_THEMES.kissan;
const KS_INPUT = `${INPUT} text-[17px]`;
const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

/** A Kashmiri text box with the Kashmiri letters under it. */
function KsBox({ value, onChange, rows = 1, label, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; label: string; placeholder?: string }) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  return (
    <Field label={label}>
      {rows > 1 ? (
        <textarea ref={ref} lang="ks" dir="rtl" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={KS_INPUT} />
      ) : (
        <input ref={ref} lang="ks" dir="rtl" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={KS_INPUT} />
      )}
      <KashmiriKeys className="mt-1.5" target={ref} value={value} onChange={onChange} />
    </Field>
  );
}

const Ks = ({ children, className = '' }: { children: string; className?: string }) => (
  <p lang="ks" dir="rtl" className={`text-[17px] text-slate-900 ${className}`}>
    {children}
  </p>
);

export function KoshurLab({ admin = false }: { admin?: boolean }) {
  const [section, setSection] = useState<Section>('reports');
  const [openReports, setOpenReports] = useState<number | null>(null);
  const sections: { id: Section; label: string; icon: typeof Flag; count?: number | null }[] = [
    { id: 'reports', label: 'Reported answers', icon: Flag, count: openReports },
    { id: 'words', label: 'Words', icon: BookOpenText },
    { id: 'answers', label: 'Example answers', icon: MessageSquareText },
    { id: 'sentences', label: 'KashRoot sentences', icon: Languages },
    ...(admin ? [{ id: 'editors' as const, label: 'Editors', icon: Users }] : []),
  ];

  return (
    <div className="space-y-6">
      <Panel theme={theme} title="Kashmiri Lab" icon={Languages}>
        <p className="text-sm text-slate-700">
          Native speakers teach the assistant proper Kashmiri. Correct the answers people reported, add words with every vowel mark, and fix KashRoot’s own sentences. The assistant uses all of it in every Kashmiri answer within 5 minutes: it writes your words, follows your answers, rewrites replies that come out as Urdu, and puts the vowel marks back on words you have added.
        </p>
        <div role="tablist" aria-label="Kashmiri Lab sections" className="mt-4 flex flex-wrap gap-2">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={section === s.id}
              onClick={() => setSection(s.id)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${section === s.id ? theme.solid : `${theme.soft}`}`}
            >
              <s.icon className="h-4 w-4" aria-hidden /> {s.label}
              {s.count ? <span className="rounded-full bg-white/80 px-1.5 text-xs text-slate-900">{s.count}</span> : null}
            </button>
          ))}
        </div>
      </Panel>
      {section === 'reports' && <Reports onCount={setOpenReports} />}
      {section === 'words' && <Words />}
      {section === 'answers' && <Answers />}
      {section === 'sentences' && <Sentences />}
      {section === 'editors' && admin && <Editors />}
    </div>
  );
}

/* ───────────────────────── reported answers ───────────────────────── */

function Reports({ onCount }: { onCount: (n: number) => void }) {
  const [rows, setRows] = useState<KsReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await ksReports('open');
      setRows(r);
      onCount(r.length);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [onCount]);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (live) await load();
    })();
    return () => {
      live = false;
    };
  }, [load]);

  return (
    <Panel theme={theme} title="Reported answers" icon={Flag} action={<RefreshBtn onRefresh={load} variant="ghost" />}>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {rows === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {rows?.length === 0 && <EmptyState theme={theme} icon={CheckCircle2} title="Nothing waiting" text="When someone presses “Not proper Kashmiri? Correct it” under an answer, it appears here." />}
      <ul className="space-y-4">
        {rows?.map((r) => (
          <ReportRow key={r.id} report={r} onDone={load} />
        ))}
      </ul>
    </Panel>
  );
}

function ReportRow({ report, onDone }: { report: KsReport; onDone: () => Promise<void> }) {
  const [text, setText] = useState(report.suggestion ?? report.reply);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await onDone();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-900/5">
      <p className="text-xs text-slate-500">{new Date(report.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      {report.question && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question</p>
          <p dir="auto" className="text-slate-800">{report.question}</p>
        </div>
      )}
      <div className="mt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Answer that was reported</p>
        <Ks className="rounded-xl bg-rose-50/60 p-2.5">{report.reply}</Ks>
      </div>
      {report.note && <p className="mt-2 text-sm text-slate-700">Note: {report.note}</p>}
      {report.suggestion && <p className="mt-2 text-xs font-semibold text-emerald-800">The person who reported it suggested a wording — it is in the box below.</p>}
      <div className="mt-3">
        <KsBox label="Correct Kashmiri answer" rows={4} value={text} onChange={setText} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn theme={theme} icon={CheckCircle2} disabled={busy || !text.trim()} onClick={() => void act(() => fixKsReport(report, text), 'Saved — the assistant follows it within 5 minutes')}>
          Save correct answer
        </Btn>
        <Btn theme={theme} variant="ghost" icon={X} disabled={busy} onClick={() => void act(() => closeKsReport(report.id, 'dismissed'), 'Dismissed')}>
          The answer was fine
        </Btn>
      </div>
    </li>
  );
}

/* ───────────────────────── words ───────────────────────── */

function Words() {
  const [rows, setRows] = useState<KsWordRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ kashmiri: '', meaning: '', note: '' });
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<KsWordRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await ksWords());
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (live) await load();
    })();
    return () => {
      live = false;
    };
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows ?? [];
    const plain = skeleton(q);
    return (rows ?? []).filter((w) => w.meaning.toLowerCase().includes(q) || skeleton(w.kashmiri).includes(plain) || (w.note ?? '').toLowerCase().includes(q));
  }, [rows, query]);

  const add = async () => {
    if (!form.kashmiri.trim() || !form.meaning.trim()) return toast.error('Write the Kashmiri word and its meaning.');
    setBusy(true);
    try {
      if (editing) await updateKsWord(editing.id, form);
      else await addKsWord(form);
      toast.success(editing ? 'Word updated' : 'Word added');
      setForm({ kashmiri: '', meaning: '', note: '' });
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  /** One word per line: "کٲشُر = Kashmiri language" (or a tab instead of "="; the meaning may contain ":" or "="). */
  const addMany = async () => {
    const lines = bulk.split('\n').map((l) => l.trim()).filter(Boolean);
    const pairs = lines.map((l) => /^(.+?)\s*(?:=|\t)\s*(.+)$/.exec(l)).filter((m): m is RegExpExecArray => Boolean(m));
    if (!pairs.length) return toast.error('Write one word per line: Kashmiri = meaning');
    setBusy(true);
    let added = 0;
    const failed: string[] = [];
    for (const [, kashmiri, meaning] of pairs) {
      try {
        await addKsWord({ kashmiri, meaning });
        added++;
      } catch (err) {
        failed.push(`${kashmiri}: ${errorText(err)}`);
      }
    }
    setBusy(false);
    toast[failed.length ? 'warning' : 'success'](`${added} word${added === 1 ? '' : 's'} added${failed.length ? `, ${failed.length} not added (${failed.slice(0, 2).join('; ')})` : ''}`);
    if (added) setBulk('');
    await load();
  };

  const remove = async (w: KsWordRow) => {
    if (!window.confirm(`Delete ${w.kashmiri} (${w.meaning})?`)) return;
    try {
      await deleteKsWord(w.id);
      toast.success('Deleted');
      await load();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Panel theme={theme} title={editing ? 'Correct this word' : 'Add a word'} icon={Plus}>
        <div className="grid gap-3">
          <KsBox label="Kashmiri, with every vowel mark" value={form.kashmiri} onChange={(v) => setForm({ ...form, kashmiri: v })} placeholder="کٲشُر" />
          <Field label="Meaning (English or Urdu)">
            <input className={INPUT} value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} placeholder="Kashmiri (the language)" />
          </Field>
          <Field label="Note (optional)" hint="e.g. used in South Kashmir, or the plural">
            <input className={INPUT} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Btn theme={theme} icon={editing ? CheckCircle2 : Plus} disabled={busy} onClick={() => void add()}>{editing ? 'Save word' : 'Add word'}</Btn>
            {editing && <Btn theme={theme} variant="ghost" onClick={() => { setEditing(null); setForm({ kashmiri: '', meaning: '', note: '' }); }}>Cancel</Btn>}
          </div>
          <button type="button" onClick={() => setShowBulk((v) => !v)} className="w-fit cursor-pointer text-sm font-semibold text-emerald-800 underline-offset-2 hover:underline">
            {showBulk ? 'Hide' : 'Add many words at once'}
          </button>
          {showBulk && (
            <div className="grid gap-2">
              <p className="text-xs text-slate-600">One word per line: <span lang="ks">کٲشُر</span> = Kashmiri language</p>
              <textarea lang="ks" dir="rtl" rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} className={KS_INPUT} />
              <Btn theme={theme} variant="soft" icon={Plus} disabled={busy || !bulk.trim()} onClick={() => void addMany()}>Add these words</Btn>
            </div>
          )}
        </div>
      </Panel>

      <Panel theme={theme} title={`Words${rows ? ` (${rows.length})` : ''}`} icon={BookOpenText} action={<RefreshBtn onRefresh={load} variant="ghost" />}>
        <label className="relative block">
          <span className="sr-only">Search words</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className={`${INPUT} pl-9`} dir="auto" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search in Kashmiri or English" />
        </label>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
        {rows?.length === 0 && <p className="mt-3 text-sm text-slate-600">No words yet. Start with the words farmers use every day: crops, diseases, weather, money, numbers.</p>}
        <ul className="mt-3 max-h-[32rem] divide-y divide-slate-900/5 overflow-y-auto">
          {shown.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Ks className="text-left">{w.kashmiri}</Ks>
                <p className="text-sm text-slate-600">{w.meaning}{w.note ? <span className="text-slate-400"> · {w.note}</span> : null}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Btn theme={theme} size="sm" variant="ghost" icon={Pencil} aria-label={`Correct ${w.meaning}`} onClick={() => { setEditing(w); setForm({ kashmiri: w.kashmiri, meaning: w.meaning, note: w.note ?? '' }); }} />
                <Btn theme={theme} size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${w.meaning}`} onClick={() => void remove(w)} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ───────────────────────── example answers ───────────────────────── */

function Answers() {
  const [rows, setRows] = useState<KsExampleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ question: '', answer: '' });
  const [editing, setEditing] = useState<KsExampleRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await ksExamples());
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (live) await load();
    })();
    return () => {
      live = false;
    };
  }, [load]);

  const save = async () => {
    if (!form.answer.trim()) return toast.error('Write the Kashmiri answer.');
    setBusy(true);
    try {
      if (editing) await updateKsExample(editing.id, form.question, form.answer);
      else await addKsExample(form.question, form.answer);
      toast.success('Saved — the assistant follows it within 5 minutes');
      setForm({ question: '', answer: '' });
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: KsExampleRow) => {
    if (!window.confirm('Delete this example answer?')) return;
    try {
      await deleteKsExample(e.id);
      toast.success('Deleted');
      await load();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Panel theme={theme} title={editing ? 'Correct this answer' : 'Add an example answer'} icon={Plus}>
        <p className="mb-3 text-sm text-slate-600">Write a question people ask, and how a Kashmiri speaker would answer it. For similar questions the assistant follows your words and style (with today’s prices and weather).</p>
        <div className="grid gap-3">
          <Field label="Question (any language)">
            <input className={INPUT} dir="auto" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="How do I book cold storage?" />
          </Field>
          <KsBox label="Answer in proper Kashmiri" rows={5} value={form.answer} onChange={(v) => setForm({ ...form, answer: v })} />
          <div className="flex flex-wrap gap-2">
            <Btn theme={theme} icon={CheckCircle2} disabled={busy} onClick={() => void save()}>{editing ? 'Save answer' : 'Add answer'}</Btn>
            {editing && <Btn theme={theme} variant="ghost" onClick={() => { setEditing(null); setForm({ question: '', answer: '' }); }}>Cancel</Btn>}
          </div>
        </div>
      </Panel>
      <Panel theme={theme} title={`Example answers${rows ? ` (${rows.length})` : ''}`} icon={MessageSquareText} action={<RefreshBtn onRefresh={load} variant="ghost" />}>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-600">No example answers yet. Corrected reports appear here too.</p>}
        <ul className="max-h-[36rem] space-y-3 overflow-y-auto">
          {rows?.map((e) => (
            <li key={e.id} className="rounded-2xl bg-white/80 p-3 ring-1 ring-slate-900/5">
              <p dir="auto" className="text-sm font-semibold text-slate-800">{e.question}</p>
              <Ks className="mt-1">{e.answer}</Ks>
              <div className="mt-2 flex gap-1">
                <Btn theme={theme} size="sm" variant="ghost" icon={Pencil} onClick={() => { setEditing(e); setForm({ question: e.question === '—' ? '' : e.question, answer: e.answer }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Correct</Btn>
                <Btn theme={theme} size="sm" variant="ghost" icon={Trash2} onClick={() => void remove(e)}>Delete</Btn>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ───────────────────────── KashRoot's own sentences ───────────────────────── */

function Sentences() {
  const [saved, setSaved] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setSaved(await ksPhraseRows());
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (live) await load();
    })();
    return () => {
      live = false;
    };
  }, [load]);
  const checked = saved ? KS_PHRASE_KEYS.filter((k) => saved[k]).length : 0;

  return (
    <Panel theme={theme} title="KashRoot’s own Kashmiri sentences" icon={Languages} action={<RefreshBtn onRefresh={load} variant="ghost" />}>
      <p className="text-sm text-slate-700">
        These lines appear on the website and in the assistant (buttons, “sorry, try again” …). They are first drafts until an editor checks them: correct the Kashmiri, or press <strong>It is correct</strong>.
        {saved && <span className="font-semibold"> {checked} of {KS_PHRASE_KEYS.length} checked.</span>}
      </p>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      <ul className="mt-4 space-y-4">
        {saved && KS_PHRASE_KEYS.map((k) => <SentenceRow key={k} id={k} saved={saved[k]} onDone={load} />)}
      </ul>
    </Panel>
  );
}

function SentenceRow({ id, saved, onDone }: { id: KsPhraseKey; saved?: string; onDone: () => Promise<void> }) {
  const [text, setText] = useState(saved ?? KS_PHRASES[id].ks);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await onDone();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const changed = text.trim() !== (saved ?? KS_PHRASES[id].ks);
  return (
    <li className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{KS_PHRASES[id].en}</p>
        {saved ? <Badge tone="green">Checked by an editor</Badge> : <Badge tone="amber">First draft — please check</Badge>}
      </div>
      {KS_PHRASES[id].ks.includes('{') ? <p className="mt-1 text-xs text-slate-500">Keep {'{place}'} as it is: the page’s name goes there.</p> : null}
      <div className="mt-2">
        <KsBox label="Kashmiri" value={text} onChange={setText} rows={text.length > 60 ? 2 : 1} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Btn theme={theme} size="sm" icon={CheckCircle2} disabled={busy || !text.trim() || (!changed && Boolean(saved))} onClick={() => void act(() => saveKsPhrase(id, text), 'Saved')}>
          {changed ? 'Save correction' : 'It is correct'}
        </Btn>
        {saved && (
          <Btn theme={theme} size="sm" variant="ghost" disabled={busy} onClick={() => void act(async () => { await resetKsPhrase(id); setText(KS_PHRASES[id].ks); }, 'Back to the first draft')}>
            Back to first draft
          </Btn>
        )}
      </div>
    </li>
  );
}

/* ───────────────────────── editors (admins) ───────────────────────── */

function Editors() {
  const [rows, setRows] = useState<KsEditor[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setRows(await ksEditors());
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (live) await load();
    })();
    return () => {
      live = false;
    };
  }, [load]);

  const add = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error('Write their account email.');
    setBusy(true);
    try {
      await addKsEditor(email);
      toast.success('Added as a Kashmiri editor');
      setEmail('');
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: KsEditor) => {
    if (!window.confirm(`Remove ${e.email} as a Kashmiri editor?`)) return;
    try {
      await removeKsEditor(e.user_id);
      toast.success('Removed');
      await load();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <Panel theme={theme} title="Kashmiri editors" icon={Users} action={<RefreshBtn onRefresh={load} variant="ghost" />}>
      <p className="text-sm text-slate-700">
        Native Kashmiri speakers who correct the assistant. They create a KashRoot account (any portal), you add their email here, and they open <strong>{publicOrigin().replace(/^https?:\/\//, '')}/koshur</strong>. They cannot see anything else in Admin. Their words and answers count as contributions (Contributors tab), so you can pay them later.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Editor’s account email</span>
          <input type="email" className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>
        <Btn theme={theme} icon={UserPlus} disabled={busy} onClick={() => void add()}>Add editor</Btn>
      </div>
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      {rows?.length === 0 && <p className="mt-3 text-sm text-slate-600">No editors yet — admins can edit everything here themselves.</p>}
      <ul className="mt-3 divide-y divide-slate-900/5">
        {rows?.map((e) => (
          <li key={e.user_id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{e.full_name || e.email}</p>
              <p className="text-sm text-slate-600">{e.email} · since {new Date(e.granted_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
            </div>
            <Btn theme={theme} size="sm" variant="danger" icon={Trash2} onClick={() => void remove(e)}>Remove</Btn>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
