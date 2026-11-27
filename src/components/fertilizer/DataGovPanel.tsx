'use client';

/**
 * Under a TrueScan answer: what the Government of India's open-data portal (data.gov.in) publishes about the word
 * typed, looked up live by the server with the site's key (/api/truescan/datagov). Rows are shown as published, with
 * their dataset's name, publisher and date. It says plainly when nothing mentions the word, and that many of these
 * datasets are statistics, not registers of products.
 */
import { useEffect, useState } from 'react';
import { Database, Loader2 } from 'lucide-react';

import { isSkuastDataset, type DataGovAnswer } from '@/lib/dataGovTruescan';

type State = { s: 'loading' } | { s: 'done'; answer: DataGovAnswer } | { s: 'failed' };

const when = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function DataGovPanel({ query }: { query: string }) {
  const [state, setState] = useState<State>({ s: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setState({ s: 'loading' });
      try {
        const res = await fetch(`/api/truescan/datagov?q=${encodeURIComponent(query)}`, { cache: 'no-store', signal: controller.signal });
        setState({ s: 'done', answer: (await res.json()) as DataGovAnswer });
      } catch {
        if (!controller.signal.aborted) setState({ s: 'failed' });
      }
    })();
    return () => controller.abort();
  }, [query]);

  // Not connected on this site: nothing to show, nothing to apologise for.
  if (state.s === 'done' && !state.answer.ok && state.answer.reason === 'no_key') return null;

  return (
    <section aria-labelledby="datagov-title" className="mt-4 rounded-2xl bg-sky-50/80 p-4 text-sm text-slate-800 ring-1 ring-sky-200">
      <h3 id="datagov-title" className="flex items-center gap-2 text-base font-semibold text-sky-950">
        <Database className="h-5 w-5 shrink-0" aria-hidden /> On data.gov.in (Government of India open data)
      </h3>

      {state.s === 'loading' && (
        <p role="status" className="mt-2 flex items-center gap-2 text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Looking in the Government’s pesticide and fertiliser datasets…
        </p>
      )}

      {state.s === 'failed' && <p className="mt-2 text-slate-700">data.gov.in could not be reached just now. The answers above are not affected.</p>}

      {state.s === 'done' && !state.answer.ok && state.answer.reason !== 'no_key' && <p className="mt-2 text-slate-700">{state.answer.message}</p>}

      {state.s === 'done' && state.answer.ok && (
        <div className="mt-2 space-y-4">
          {state.answer.hits.length === 0 ? (
            <p>
              None of the {state.answer.checkedRows.toLocaleString('en-IN')} rows in the {state.answer.datasets.length} pesticide and fertiliser dataset{state.answer.datasets.length === 1 ? '' : 's'} on data.gov.in mentions “{state.answer.query}”.
            </p>
          ) : (
            state.answer.hits.map((h) => (
              <div key={h.dataset.id}>
                <p className="font-semibold text-slate-900">
                  {h.dataset.title}
                  {isSkuastDataset(h.dataset) && <span className="ml-2 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-900 ring-1 ring-indigo-300">SKUAST-Kashmir</span>}
                </p>
                <p className="text-xs text-slate-600">
                  {[h.dataset.org, when(h.dataset.updated) ? `updated ${when(h.dataset.updated)}` : null].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-1.5 overflow-x-auto rounded-lg ring-1 ring-sky-200">
                  <table className="min-w-full bg-white text-left text-xs">
                    <caption className="sr-only">Rows of “{h.dataset.title}” that mention {state.answer.ok ? state.answer.query : ''}</caption>
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
            ))
          )}
          {state.answer.partial && <p className="text-xs text-amber-900">Some datasets did not load in time. Check again to look in the rest.</p>}
          <details className="text-xs text-slate-600">
            <summary className="flex min-h-11 cursor-pointer items-center">Datasets looked in ({state.answer.datasets.length})</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {state.answer.datasets.map((d) => (
                <li key={d.id}>
                  {d.title}
                  {d.org ? ` — ${d.org}` : ''}
                </li>
              ))}
            </ul>
          </details>
          <p className="text-xs text-slate-600">
            {state.answer.datasets.some(isSkuastDataset)
              ? 'SKUAST-Kashmir datasets are among those looked in.'
              : 'No dataset published by SKUAST-Kashmir turned up in this search. KashRoot’s typed copy of the SKUAST-K spray schedule is shown separately, when it has the product.'}{' '}
            Published by the Government of India on data.gov.in and shown as published, read just now. Many of these datasets are statistics (production, imports, consumption), not a register of products: they do not show that a product on a shelf is genuine. For that, check the registration number on the label.
          </p>
        </div>
      )}
    </section>
  );
}
