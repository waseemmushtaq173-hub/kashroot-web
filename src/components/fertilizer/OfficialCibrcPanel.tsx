'use client';

/**
 * The official Government pesticide lists in TrueScan: what is banned, restricted and registered in India, as the
 * Central Insecticides Board & Registration Committee (CIB&RC, ppqs.gov.in) publishes them. Everything shown is read
 * row for row from the Government's own PDFs (src/lib/cibrcOfficial.ts); KashRoot adds no entry of its own, and each
 * list carries the date printed on it.
 *   OfficialCibrcAnswerPanel  what the lists say about the word typed
 *   OfficialCibrcLists        the lists themselves, one tap each, with a filter
 */
import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CircleAlert, Loader2, TriangleAlert } from 'lucide-react';

import { BANNED_LABEL, CIBRC_META, CIBRC_SOURCE_NAME, loadCibrc, type CibrcAnswer, type CibrcData } from '@/lib/cibrcOfficial';

const count = (n: number) => n.toLocaleString('en-IN');
const asOn = (d: string | null | undefined) => (d ? `as on ${d}` : '');
const SHOWN = 8;

/** One line, under every answer. */
export function OfficialSourceLine({ list }: { list?: 'pesticides' | 'formulations' | 'banned' | 'household' | 'locust' }) {
  const lists = CIBRC_META.lists;
  const date = list && list !== 'locust' ? lists[list].as_on : null;
  return (
    <p className="mt-2 text-xs text-slate-600">
      Official list of the {CIBRC_SOURCE_NAME}
      {date ? `, ${asOn(date)}` : ''}. These lists name chemicals and formulations, not brands: a bottle is genuine only if its label shows a CIR registration number.
    </p>
  );
}

function Section({ tone, title, children }: { tone: 'rose' | 'amber' | 'green' | 'sky'; title: string; children: React.ReactNode }) {
  const look = {
    rose: 'bg-rose-50 ring-rose-200 text-rose-950',
    amber: 'bg-amber-50 ring-amber-200 text-amber-950',
    green: 'bg-forest-soft ring-forest-line text-slate-900',
    sky: 'bg-sky-50 ring-sky-200 text-slate-900',
  }[tone];
  const Icon = tone === 'rose' ? CircleAlert : tone === 'amber' ? TriangleAlert : BadgeCheck;
  return (
    <section aria-label={title} className={`rounded-2xl p-4 ring-1 ${look}`}>
      <p className="flex items-center gap-2 text-base font-semibold">
        <Icon className="h-5 w-5 shrink-0" aria-hidden /> {title}
      </p>
      {children}
    </section>
  );
}

/** What the official lists say about the word typed. Shows nothing when nothing matched. */
export function OfficialCibrcAnswerPanel({ answer, onPick }: { answer: CibrcAnswer; onPick?: (name: string) => void }) {
  const [allFormulations, setAllFormulations] = useState(false);
  const b = CIBRC_META.lists.banned;
  const forms = allFormulations ? answer.formulations : answer.formulations.slice(0, SHOWN);
  // On the banned list (dated later than the registered lists): the ban applies, whatever an older list still shows.
  const bannedToo = answer.banned.some((x) => x.list === 'banned');
  const bannedNote = bannedToo ? <p className="mt-1 font-semibold text-rose-800">This is also on the banned list above, which is dated later: the ban applies.</p> : null;

  if (answer.total === 0) {
    return answer.didYouMean.length ? (
      <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">
        Not found in the official lists as typed. Did you mean{' '}
        {answer.didYouMean.map((n, i) => (
          <span key={n}>
            {i > 0 && ', '}
            {onPick ? (
              <button type="button" onClick={() => onPick(n)} className="inline-flex min-h-11 cursor-pointer items-center font-semibold underline underline-offset-2">{n}</button>
            ) : (
              <strong>{n}</strong>
            )}
          </span>
        ))}
        ?
      </p>
    ) : null;
  }

  return (
    <div className="space-y-3 text-sm">
      {answer.banned.length > 0 && (
        <Section tone="rose" title={answer.banned.some((x) => x.list === 'banned') ? 'Banned in India' : 'Not allowed in India'}>
          <ul className="mt-2 space-y-2">
            {answer.banned.map(({ list, row }) => (
              <li key={`${list}-${row.n}`} className="rounded-xl bg-white/80 p-3 ring-1 ring-rose-100">
                <p className="font-semibold text-slate-900">{row.name}</p>
                <p className="text-rose-800">{BANNED_LABEL[list]}</p>
                {row.notification && <p className="text-xs text-slate-700">Notification: {row.notification}</p>}
                {row.note && <p className="text-xs text-slate-700">{row.note}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-600">List of pesticides banned, refused registration and restricted in use, {asOn(b.as_on)}.</p>
        </Section>
      )}

      {answer.restricted.length > 0 && (
        <Section tone="amber" title="Allowed only with restrictions">
          <ul className="mt-2 space-y-2">
            {answer.restricted.map((r) => (
              <li key={r.n} className="rounded-xl bg-white/80 p-3 ring-1 ring-amber-100">
                <p className="font-semibold text-slate-900">{r.name}</p>
                <p className="whitespace-pre-line text-slate-800">{r.details}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-600">List of pesticides banned, refused registration and restricted in use, {asOn(b.as_on)}.</p>
        </Section>
      )}

      {answer.pesticides.length > 0 && (
        <Section tone="green" title="Registered with the Government (CIB&RC)">
          <p className="mt-1">
            Active ingredient{answer.pesticides.length === 1 ? '' : 's'} registered under section 9(3) of the Insecticides Act, 1968:{' '}
            <strong>{answer.pesticides.map((p) => p.name).join(', ')}</strong>.
          </p>
          {bannedNote}
          <p className="mt-1 text-xs text-slate-600">List of pesticides registered for use in the country, {asOn(CIBRC_META.lists.pesticides.as_on)}.</p>
        </Section>
      )}

      {answer.formulations.length > 0 && (
        <Section tone="green" title={`Registered formulations (${count(answer.formulations.length)})`}>
          {bannedNote}
          <ul className="mt-2 space-y-1.5">
            {forms.map((f) => (
              <li key={f.n} className="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-white/80 px-3 py-2 ring-1 ring-forest-line">
                <span className="font-semibold text-slate-900">{f.name}</span>
                <span className="text-xs text-slate-600">{f.category}</span>
                {f.exact && <span className="rounded-full bg-forest px-2 py-0.5 text-[11px] font-semibold text-white">matches what you typed</span>}
              </li>
            ))}
          </ul>
          {answer.formulations.length > SHOWN && !allFormulations && (
            <button type="button" onClick={() => setAllFormulations(true)} className="mt-2 min-h-11 cursor-pointer rounded-xl bg-white px-4 font-semibold text-forest-deep ring-1 ring-forest-line hover:bg-forest-soft">
              Show all {count(answer.formulations.length)}
            </button>
          )}
          <p className="mt-2 text-xs text-slate-600">List of pesticide formulations registered for use in the country, {asOn(CIBRC_META.lists.formulations.as_on)}. A formulation being listed means that strength and form is approved: it does not name a company or a batch.</p>
        </Section>
      )}

      {answer.household.length > 0 && (
        <Section tone="sky" title="Household, public health and rodent control">
          <ul className="mt-2 space-y-1.5">
            {answer.household.slice(0, SHOWN).map((h) => (
              <li key={h.n} className="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-white/80 px-3 py-2 ring-1 ring-sky-100">
                <span className="font-semibold text-slate-900">{h.name}</span>
                <span className="text-xs text-slate-600">{h.category}</span>
              </li>
            ))}
          </ul>
          {answer.household.length > SHOWN && <p className="mt-1 text-xs text-slate-600">and {count(answer.household.length - SHOWN)} more: see the list below.</p>}
          <p className="mt-2 text-xs text-slate-600">Insecticides registered for household, public health and rodent control, {asOn(CIBRC_META.lists.household.as_on)}.</p>
        </Section>
      )}

      {answer.locust.length > 0 && (
        <Section tone="sky" title="Approved for desert locust control">
          <ul className="mt-2 space-y-1.5">
            {answer.locust.map((l) => (
              <li key={l.n} className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-sky-100">
                <span className="font-semibold text-slate-900">{l.name}</span>
                <span className="block text-xs text-slate-700">{l.group}: {l.ai_g_per_ha} g active ingredient and {l.formulation_per_ha} g or ml of the product per hectare</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <OfficialSourceLine />
    </div>
  );
}

type ListId = 'banned' | 'banned_for_export_only' | 'withdrawn' | 'refused' | 'restricted' | 'pesticides' | 'formulations' | 'household' | 'locust';

interface Line {
  key: string;
  name: string;
  detail: string;
}

function linesOf(data: CibrcData, id: ListId): Line[] {
  switch (id) {
    case 'banned':
    case 'banned_for_export_only':
    case 'withdrawn':
    case 'refused':
      return data.banned[id].map((r) => ({ key: `${id}${r.n}`, name: r.name, detail: [r.notification, r.note].filter(Boolean).join(' · ') }));
    case 'restricted':
      return data.banned.restricted.map((r) => ({ key: `r${r.n}`, name: r.name, detail: r.details }));
    case 'pesticides':
      return data.pesticides.rows.map((r) => ({ key: `p${r.n}`, name: r.name, detail: '' }));
    case 'formulations':
      return data.formulations.rows.map((r) => ({ key: `f${r.n}`, name: r.name, detail: r.category }));
    case 'household':
      return data.household.rows.map((r) => ({ key: `h${r.n}`, name: r.name, detail: r.category }));
    case 'locust':
      return data.locust.rows.map((r) => ({ key: `l${r.n}`, name: r.name, detail: `${r.group}: ${r.ai_g_per_ha} g active ingredient and ${r.formulation_per_ha} g or ml of the product per hectare` }));
  }
}

const L = CIBRC_META.lists;
const LISTS: { id: ListId; label: string; n: number; asOn: string | null; tone: string }[] = [
  { id: 'banned', label: 'Banned', n: L.banned.banned, asOn: L.banned.as_on, tone: 'text-rose-800' },
  { id: 'banned_for_export_only', label: 'Banned, export only', n: L.banned.banned_for_export_only, asOn: L.banned.as_on, tone: 'text-rose-800' },
  { id: 'withdrawn', label: 'Withdrawn', n: L.banned.withdrawn, asOn: L.banned.as_on, tone: 'text-rose-800' },
  { id: 'refused', label: 'Refused registration', n: L.banned.refused, asOn: L.banned.as_on, tone: 'text-rose-800' },
  { id: 'restricted', label: 'Restricted in use', n: L.banned.restricted, asOn: L.banned.as_on, tone: 'text-amber-800' },
  { id: 'pesticides', label: 'Registered pesticides', n: L.pesticides.count, asOn: L.pesticides.as_on, tone: 'text-forest-deep' },
  { id: 'formulations', label: 'Registered formulations', n: L.formulations.count, asOn: L.formulations.as_on, tone: 'text-forest-deep' },
  { id: 'household', label: 'Household and public health', n: L.household.count, asOn: L.household.as_on, tone: 'text-sky-800' },
  { id: 'locust', label: 'Desert locust control', n: L.locust.count, asOn: null, tone: 'text-sky-800' },
];

/** The lists themselves: tap one, filter it, read it. The data is fetched when one is first opened. */
export function OfficialCibrcLists() {
  const [open, setOpen] = useState<ListId | null>(null);
  const [data, setData] = useState<CibrcData | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    if (!open || data) return;
    let live = true;
    loadCibrc().then((d) => live && setData(d)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, data]);

  const all = useMemo(() => (data && open ? linesOf(data, open) : []), [data, open]);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? all.filter((l) => `${l.name} ${l.detail}`.toLowerCase().includes(f)) : all;
  }, [all, filter]);
  const chosen = LISTS.find((l) => l.id === open);

  return (
    <section id="official-lists" aria-labelledby="official-lists-title" className="mt-6 rounded-2xl bg-sky-50/80 p-4 text-sm text-slate-800 ring-1 ring-sky-200">
      <h3 id="official-lists-title" className="flex items-center gap-2 text-base font-semibold text-sky-950">
        <BadgeCheck className="h-5 w-5" aria-hidden /> Official Government lists
      </h3>
      <p className="mt-1 text-xs text-slate-600">Central Insecticides Board &amp; Registration Committee (CIB&amp;RC), ppqs.gov.in, as the Government published them. Tap a list.</p>
      <div role="group" aria-label="Official lists" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {LISTS.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={open === l.id}
            onClick={() => {
              setOpen(open === l.id ? null : l.id);
              setFilter('');
              setLimit(100);
            }}
            className={`min-h-11 cursor-pointer rounded-xl px-3 py-2 text-left ring-1 transition ${open === l.id ? 'bg-white ring-2 ring-sky-700' : 'bg-white/70 ring-sky-200 hover:bg-white'}`}
          >
            <span className={`block text-lg font-extrabold tabular-nums ${l.tone}`}>{count(l.n)}</span>
            <span className="block text-xs font-semibold text-slate-900">{l.label}</span>
            {l.asOn && <span className="block text-[11px] text-slate-600">{asOn(l.asOn)}</span>}
          </button>
        ))}
      </div>

      {open && chosen && (
        <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-sky-200">
          <label htmlFor="official-filter" className="block text-xs font-semibold text-slate-700">Search “{chosen.label}”</label>
          <input
            id="official-filter"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLimit(100);
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. Mancozeb"
            className="mt-1 block min-h-11 w-full rounded-xl border-0 bg-white px-3 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-forest"
          />
          {failed && <p role="alert" className="mt-2 text-rose-800">The list could not be loaded. Check your internet and try again.</p>}
          {!data && !failed && (
            <p role="status" className="mt-2 flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the list…
            </p>
          )}
          {data && (
            <>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {count(shown.length)} of {count(all.length)}
                {chosen.asOn ? ` · ${asOn(chosen.asOn)}` : ''}
              </p>
              <ul className="mt-1 max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-100">
                {shown.slice(0, limit).map((l) => (
                  <li key={l.key} className="px-3 py-2">
                    <p className="font-semibold text-slate-900">{l.name}</p>
                    {l.detail && <p className="whitespace-pre-line text-xs text-slate-700">{l.detail}</p>}
                  </li>
                ))}
                {shown.length === 0 && <li className="px-3 py-2 text-slate-600">Nothing in this list matches.</li>}
              </ul>
              {shown.length > limit && (
                <button type="button" onClick={() => setLimit(limit + 200)} className="mt-2 min-h-11 cursor-pointer rounded-xl bg-white px-4 font-semibold text-sky-900 ring-1 ring-sky-200 hover:bg-sky-100">
                  Show more
                </button>
              )}
            </>
          )}
        </div>
      )}
      <OfficialSourceLine />
    </section>
  );
}
