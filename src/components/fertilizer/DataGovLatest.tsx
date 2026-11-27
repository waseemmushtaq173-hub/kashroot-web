'use client';

/**
 * On the TrueScan page: what data.gov.in (Government of India open data) has published most recently on fertilisers and
 * pesticides, each dataset with its newest rows, read live by the server with the site's key (/api/truescan/datagov?latest=1).
 * Shown as published, with the dataset's name, publisher and date. Closed to begin with so it never pushes the checker down;
 * nothing is shown when the site has no key or the portal cannot be reached.
 */
import { useEffect, useState } from 'react';
import { Database, Loader2 } from 'lucide-react';

import type { DataGovLatest as Latest } from '@/lib/dataGovTruescan';

type State = { s: 'loading' } | { s: 'done'; answer: Latest } | { s: 'failed' };

const when = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function DataGovLatest() {
  const [state, setState] = useState<State>({ s: 'loading' });
  const [opened, setOpened] = useState(false);

  // Read when it is opened, not on every visit to the page.
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/truescan/datagov?latest=1', { cache: 'no-store', signal: controller.signal });
        setState({ s: 'done', answer: (await res.json()) as Latest });
      } catch {
        if (!controller.signal.aborted) setState({ s: 'failed' });
      }
    })();
    return () => controller.abort();
  }, [opened]);

  return (
    <details onToggle={(e) => setOpened((e.currentTarget as HTMLDetailsElement).open || opened)} className="mt-4 rounded-2xl bg-sky-50/80 p-3 text-sm text-slate-800 ring-1 ring-sky-200 sm:p-4">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-base font-semibold text-sky-950">
        <Database className="h-5 w-5 shrink-0" aria-hidden /> Latest from data.gov.in
      </summary>

      {opened && state.s === 'loading' && (
        <p role="status" className="mt-2 flex items-center gap-2 text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading the newest datasets…
        </p>
      )}
      {state.s === 'failed' && <p className="mt-2 text-slate-700">data.gov.in could not be reached just now.</p>}
      {state.s === 'done' && !state.answer.ok && <p className="mt-2 text-slate-700">{state.answer.message}</p>}
      {state.s === 'done' && state.answer.ok && (
        <div className="mt-2 space-y-4">
          {state.answer.items.map((h) => (
            <div key={h.dataset.id}>
              <p className="font-semibold text-slate-900">{h.dataset.title}</p>
              <p className="text-xs text-slate-600">{[h.dataset.org, when(h.dataset.updated) ? `updated ${when(h.dataset.updated)}` : null].filter(Boolean).join(' · ')}</p>
              <div className="mt-1.5 overflow-x-auto rounded-lg ring-1 ring-sky-200">
                <table className="min-w-full bg-white text-left text-xs">
                  <caption className="sr-only">Newest rows of “{h.dataset.title}”</caption>
                  <thead className="bg-sky-100 text-sky-950">
                    <tr>
                      {h.columns.map((c, i) => (
                        <th key={`${c}-${i}`} scope="col" className="px-2.5 py-1.5 font-semibold">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {h.rows.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((cell, ci) => (
                          <td key={ci} className="px-2.5 py-1.5 text-slate-800">{cell || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-600">Published by the Government of India and shown as published, read just now.</p>
        </div>
      )}
    </details>
  );
}
