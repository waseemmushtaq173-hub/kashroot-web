'use client';

/**
 * Admin → Official lists → "Keep a list up to date automatically".
 * Gives an official list the link of the file the Government publishes it in; the server reads
 * that link every day and updates the list only when the file has changed (src/lib/officialFeed.ts,
 * /api/admin/official-feeds). Only the Super Admin can set this up: the server reads the address.
 * Nothing is typed in: the list's products come from the file.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Pause, Play, RefreshCw, Search, Trash2 } from 'lucide-react';

import { Badge, Btn, EmptyState, Field, INPUT, Panel, PORTAL_THEMES, Skeleton } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import type { OfficialListInfo } from '@/lib/db/registry';
import { KIND_LABEL, type OfficialKind } from '@/lib/fertilizer/officialList';
import { KEY_PLACEHOLDER } from '@/lib/officialFeed';
import { resourceFeedUrl, type CatalogEntry } from '@/lib/dataGovCatalog';
import { OFFICIAL_SOURCES } from '@/lib/officialSources';
import { supabase } from '@/lib/supabase';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;
const day = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const count = (n: number) => n.toLocaleString('en-IN');

interface FeedInfo {
  id: string;
  kind: OfficialKind;
  source: string;
  source_url: string;
  file_url: string;
  active: boolean;
  replace_missing: boolean;
  last_checked_at: string | null;
  last_changed_at: string | null;
  last_status: 'never' | 'ok' | 'unchanged' | 'failed';
  last_error: string | null;
  last_rows: number | null;
}

type Outcome = { status: 'ok'; rows: number; added: number; removed: number } | { status: 'unchanged' } | { status: 'failed'; error: string };

/** undefined: loading · string: why the feeds cannot be shown · object: the feeds. */
type Loaded = undefined | { note: string; tone: 'info' | 'error' } | { feeds: FeedInfo[]; dataGovKey: boolean };

async function call<T>(init?: { body?: Record<string, unknown> }): Promise<{ status: number; json: T & { error?: string; setupNeeded?: boolean } }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch('/api/admin/official-feeds', {
    method: init?.body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T & { error?: string; setupNeeded?: boolean } };
}

const STATUS: Record<FeedInfo['last_status'], { tone: 'slate' | 'green' | 'amber' | 'red'; text: string }> = {
  never: { tone: 'slate', text: 'Not checked yet' },
  ok: { tone: 'green', text: 'Updated' },
  unchanged: { tone: 'green', text: 'Up to date' },
  failed: { tone: 'red', text: 'Could not update' },
};

export function OfficialFeedsPanel({ lists, onChanged }: { lists: OfficialListInfo[]; onChanged: () => void }) {
  const [loaded, setLoaded] = useState<Loaded>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [replaceMissing, setReplaceMissing] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ q: string; entries: CatalogEntry[]; total: number | null } | { q: string; error: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const { status, json } = await call<{ feeds?: FeedInfo[]; dataGovKey?: boolean }>();
      if (status === 403) return setLoaded({ note: 'Only the Super Admin can set up automatic updates, because the server reads the official address for them.', tone: 'info' });
      if (json.setupNeeded) return setLoaded({ note: json.error ?? 'Run the SQL update first.', tone: 'info' });
      if (status !== 200) return setLoaded({ note: json.error ?? 'Could not read the automatic updates.', tone: 'error' });
      setLoaded({ feeds: json.feeds ?? [], dataGovKey: Boolean(json.dataGovKey) });
    } catch {
      setLoaded({ note: 'Could not reach the server. Try again.', tone: 'error' });
    }
  }, []);
  useEffect(() => {
    let on = true;
    void (async () => {
      if (on) await load();
    })();
    return () => {
      on = false;
    };
  }, [load]);

  const feeds = loaded && 'feeds' in loaded ? loaded.feeds : [];
  // Lists already imported, that do not have an automatic update yet.
  const free = lists.filter((l) => !feeds.some((f) => f.kind === l.kind && f.source === l.source));
  const chosen = free.find((l) => `${l.kind}|${l.source}` === pick) ?? free[0];

  const report = (name: string, o: Outcome) => {
    if (o.status === 'ok') toast.success(`“${name}” updated: ${count(o.rows)} products in the file, ${count(o.added)} new${o.removed ? `, ${count(o.removed)} removed` : ''}.`);
    else if (o.status === 'unchanged') toast.success(`“${name}” is already up to date with the official file.`);
    else toast.error(`“${name}”: ${o.error}`);
  };

  const check = async (f: FeedInfo) => {
    setBusy(`check|${f.id}`);
    try {
      const { json } = await call<{ outcome?: Outcome }>({ body: { action: 'check', id: f.id } });
      if (json.outcome) report(f.source, json.outcome);
      else toast.error(json.error ?? 'Could not check the list.');
    } catch {
      toast.error('Could not reach the server. Try again.');
    } finally {
      setBusy(null);
      await load();
      onChanged();
    }
  };

  const toggle = async (f: FeedInfo) => {
    setBusy(`active|${f.id}`);
    const { json } = await call<unknown>({ body: { action: 'active', id: f.id, active: !f.active } });
    if (json.error) toast.error(json.error);
    setBusy(null);
    await load();
    onChanged();
  };

  const remove = async (f: FeedInfo) => {
    if (!window.confirm(`Stop keeping “${f.source}” up to date? Its products stay as they are.`)) return;
    setBusy(`remove|${f.id}`);
    const { json } = await call<unknown>({ body: { action: 'remove', id: f.id } });
    if (json.error) toast.error(json.error);
    else toast.success(`“${f.source}” is no longer updated automatically.`);
    setBusy(null);
    await load();
    onChanged();
  };

  const search = async () => {
    const word = q.trim();
    if (word.length < 3) return;
    setSearching(true);
    try {
      const { status, json } = await call<{ entries?: CatalogEntry[]; total?: number | null }>({ body: { action: 'search_datagov', q: word } });
      setFound(status === 200 ? { q: word, entries: json.entries ?? [], total: json.total ?? null } : { q: word, error: json.error ?? 'The search failed.' });
    } catch {
      setFound({ q: word, error: 'Could not reach the server. Try again.' });
    } finally {
      setSearching(false);
    }
  };

  const pickResource = (e: CatalogEntry) => {
    setFileUrl(resourceFeedUrl(e.id));
    toast.success(free.length ? 'The link is filled in below: choose the list it belongs to.' : 'Import the list first (above), then come back and paste this link.');
  };

  const add = async () => {
    if (!chosen) return;
    setFormError(null);
    setBusy('add');
    try {
      const { status, json } = await call<{ feed?: FeedInfo }>({
        body: { action: 'add', kind: chosen.kind, source: chosen.source, source_url: chosen.source_url, file_url: fileUrl.trim(), replace_missing: replaceMissing },
      });
      if (status !== 200 || !json.feed) return setFormError(json.error ?? 'Could not save the automatic update.');
      setFileUrl('');
      // Read the file once now, so a wrong link shows up at once.
      const done = await call<{ outcome?: Outcome }>({ body: { action: 'check', id: json.feed.id } });
      if (done.json.outcome) report(chosen.source, done.json.outcome);
    } catch {
      setFormError('Could not reach the server. Try again.');
    } finally {
      setBusy(null);
      await load();
      onChanged();
    }
  };

  return (
    <Panel theme={theme} title="Keep a list up to date automatically" icon={RefreshCw}>
      <div className="space-y-4 text-sm">
        <p className="text-slate-700">
          Give a list the link of the file the Government publishes it in. KashRoot reads that file every day and, only when it has changed, brings the list up to date: new products are added and products no longer in the file are removed.
          A file that cannot be read, or that holds far fewer products than the list had, changes nothing and shows why here. Only CSV files are read, from an official address (.gov.in, .nic.in, .ac.in, .res.in).
        </p>

        <details className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-900/5">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium text-slate-900">Where the official files are published</summary>
          <p className="mt-1 text-xs text-slate-600">
            None of these publishes a list that refreshes itself: the registers are PDFs and Gazette notices. Download the newest document, save the list as CSV, and import it above; a list with a CSV link is then re-read every day.
          </p>
          <ul className="mt-2 space-y-2" aria-label="Official sources">
            {OFFICIAL_SOURCES.map((o) => (
              <li key={o.url}>
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-forest-deep underline sm:min-h-0">
                  {o.name} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
                <span className="block text-xs text-slate-600">{o.holds}</span>
              </li>
            ))}
          </ul>
        </details>

        {loaded === undefined ? (
          <Skeleton label="Loading…" rows={2} height="h-10" />
        ) : 'note' in loaded ? (
          <p role={loaded.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 ring-1 ${loaded.tone === 'error' ? 'bg-rose-50 text-rose-900 ring-rose-200' : 'bg-amber-50 text-amber-950 ring-amber-200'}`}>{loaded.note}</p>
        ) : (
          <>
            {feeds.length === 0 ? (
              <EmptyState theme={theme} icon={RefreshCw} title="No list is updated automatically yet" text="Import a list first (above), then give it the link of its official file here." />
            ) : (
              <ul className="divide-y divide-slate-100" aria-label="Lists kept up to date">
                {feeds.map((f) => {
                  const s = STATUS[f.last_status];
                  return (
                    <li key={f.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">{f.source}</p>
                        <Badge tone={f.active ? s.tone : 'slate'}>{f.active ? s.text : 'Paused'}</Badge>
                      </div>
                      <p className="text-xs text-slate-600">
                        {KIND_LABEL[f.kind]}
                        {f.last_checked_at ? ` · last checked ${day(f.last_checked_at)}` : ''}
                        {f.last_changed_at ? ` · last changed ${day(f.last_changed_at)}` : ''}
                        {f.last_rows ? ` · ${count(f.last_rows)} products in the file` : ''}
                      </p>
                      <p className="flex items-start gap-1 break-all text-xs text-slate-600">
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {f.file_url}
                      </p>
                      {f.last_status === 'failed' && f.last_error && (
                        <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-2.5 text-rose-900 ring-1 ring-rose-200">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {f.last_error} The list was not changed.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Btn theme={theme} size="sm" variant="soft" className="min-h-11" disabled={busy !== null} onClick={() => void check(f)}>
                          {busy === `check|${f.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Check now
                        </Btn>
                        <Btn theme={theme} size="sm" variant="soft" className="min-h-11" disabled={busy !== null} onClick={() => void toggle(f)}>
                          {f.active ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} {f.active ? 'Pause' : 'Resume'}
                        </Btn>
                        <button
                          type="button"
                          aria-label={`Stop keeping ${f.source} up to date`}
                          disabled={busy !== null}
                          onClick={() => void remove(f)}
                          className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-900/5">
              <p className="font-semibold text-slate-900">Find what data.gov.in publishes on a subject</p>
              <p className="text-xs text-slate-600">
                Searches data.gov.in’s own catalogue with the site’s key. Many datasets there are statistics (production, imports, consumption), not lists of products: only a dataset with one row per product, with its name and registration number, can be used as an official list.
              </p>
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  void search();
                }}
              >
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Subject to search for</span>
                  <input className={INPUT} value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="e.g. pesticide, fungicide, fertiliser" />
                </label>
                <Btn theme={theme} icon={Search} type="submit" className="min-h-11" disabled={searching || q.trim().length < 3}>
                  {searching ? 'Searching…' : 'Search'}
                </Btn>
              </form>
              {found && 'error' in found && <p role="alert" className="rounded-lg bg-rose-50 p-2.5 text-rose-900 ring-1 ring-rose-200">{found.error}</p>}
              {found && 'entries' in found && (
                <div role="status">
                  {found.entries.length === 0 ? (
                    <p className="text-slate-700">data.gov.in’s catalogue returned no dataset for “{found.q}”. Try another word, or search on data.gov.in itself.</p>
                  ) : (
                    <>
                      <p className="mb-2 text-xs text-slate-600">{found.total ? `${count(found.total)} found; the first ${found.entries.length} are shown.` : `${found.entries.length} found.`} Open a dataset to see its columns before using it.</p>
                      <ul className="divide-y divide-slate-100" aria-label={`Datasets for ${found.q}`}>
                        {found.entries.map((e) => (
                          <li key={e.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">{e.title}</p>
                              <p className="text-xs text-slate-600">{e.org ? `${e.org} · ` : ''}{e.updated ? `updated ${e.updated} · ` : ''}<span className="break-all font-mono">{e.id}</span></p>
                            </div>
                            <Btn theme={theme} size="sm" variant="soft" className="min-h-11 shrink-0" onClick={() => pickResource(e)}>
                              Use this dataset
                            </Btn>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>

            {free.length > 0 && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-900/5">
                <p className="font-semibold text-slate-900">Add the official file of a list</p>
                <Field label="Which list?">
                  <select className={`${INPUT} min-h-11`} value={chosen ? `${chosen.kind}|${chosen.source}` : ''} onChange={(e) => setPick(e.target.value)}>
                    {free.map((l) => (
                      <option key={`${l.kind}|${l.source}`} value={`${l.kind}|${l.source}`}>
                        {l.source} — {KIND_LABEL[l.kind]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Link of the official file (CSV)"
                  hint={`For a data.gov.in resource use https://api.data.gov.in/resource/<resource id>?api-key=${KEY_PLACEHOLDER} — the server puts in its own key${loaded.dataGovKey ? '' : ' (not set on this site yet: add DATA_GOV_IN_API_KEY in Vercel)'}.`}
                >
                  <input className={INPUT} type="url" inputMode="url" value={fileUrl} maxLength={1000} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" />
                </Field>
                <label className="flex min-h-11 items-start gap-2 text-slate-700">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={replaceMissing} onChange={(e) => setReplaceMissing(e.target.checked)} />
                  <span>Remove products that are no longer in the file (recommended: a product the Government withdrew should not stay on TrueScan).</span>
                </label>
                {formError && (
                  <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-2.5 text-rose-900 ring-1 ring-rose-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {formError}
                  </p>
                )}
                <Btn theme={theme} icon={RefreshCw} className="min-h-11" disabled={busy !== null || !fileUrl.trim()} onClick={() => void add()}>
                  {busy === 'add' ? 'Reading the file…' : 'Keep this list up to date'}
                </Btn>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
