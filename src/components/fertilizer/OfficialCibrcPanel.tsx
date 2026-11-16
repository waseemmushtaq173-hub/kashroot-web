'use client';

/**
 * The official Government pesticide lists in TrueScan: what is banned, restricted and registered in India, as the
 * Central Insecticides Board & Registration Committee (CIB&RC, ppqs.gov.in) publishes them. Everything shown is read
 * row for row from the Government's own PDFs (src/lib/cibrcOfficial.ts); KashRoot adds no entry of its own, and each
 * list carries the date printed on it.
 */
import { useState } from 'react';
import { BadgeCheck, CircleAlert, TriangleAlert } from 'lucide-react';

import { BANNED_LABEL, CIBRC_META, CIBRC_SOURCE_NAME, type CibrcAnswer } from '@/lib/cibrcOfficial';

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
