'use client';

/**
 * Admin → Cold stores: the directory of all cold stores farmers see in the
 * Cold Storage portal (besides the stores listed on KashRoot).
 *   • Official lists — read the National Horticulture Board's list and
 *     OpenStreetMap now (up to 30 seconds, said while it runs), see what each
 *     one gave or exactly why it failed, and add their Jammu & Kashmir cold
 *     stores to the directory. When NHB cannot be reached, its saved file can
 *     be imported right there.
 *   • Import a list — a CSV / JSON file (e.g. the NHB file saved from its
 *     website, or a MoFPI / DMI list), always with where it comes from.
 *   • Add one — a cold store checked by the KashRoot team.
 *   • Suggestions — cold stores farmers and owners say are missing: check
 *     each one (call, visit), then Approve or Remove.
 *   • The directory — search, and remove an entry.
 * Nothing is added without a source.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Database, FileUp, Loader2, Map as MapIcon, MessageSquarePlus, Plus, RefreshCw, Search, Trash2, Warehouse } from 'lucide-react';

import { Btn, EmptyState, Field, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import { NHB_DATABASE_URL, parseColdStoreList, type DirEntry, type ParsedList, type SourceState } from '@/lib/coldDirectory';
import { addDirectoryEntry, approveSuggestion, directoryRows, importDirectory, removeDirectoryEntry, type DirectoryRow } from '@/lib/db/coldDirectory';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;
const DISTRICTS = ['Anantnag', 'Bandipora', 'Baramulla', 'Budgam', 'Doda', 'Ganderbal', 'Jammu', 'Kathua', 'Kishtwar', 'Kulgam', 'Kupwara', 'Poonch', 'Pulwama', 'Rajouri', 'Ramban', 'Reasi', 'Samba', 'Shopian', 'Srinagar', 'Udhampur'];
const NHB_SOURCE = 'National Horticulture Board — National Cold Storage database';
const OSM_SOURCE = 'OpenStreetMap — the community map (openstreetmap.org)';
const OSM_URL = 'https://www.openstreetmap.org';
/** The server gives each source up to 25 seconds; the browser waits a little longer before it gives up. */
const READ_WAIT_MS = 45_000;
const blank = { name: '', district: '', place: '', capacity: '', phone: '', source: 'Checked by the KashRoot team', sourceUrl: '' };
const FILE_INPUT = 'block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:font-semibold file:text-violet-900';

type Live = { entries: DirEntry[]; sources: SourceState[] };
type ListFile = { name: string; parsed: ParsedList; onlyJK: boolean };
type ListSource = { source: string; url: string };
type Row = Omit<DirEntry, 'source' | 'sourceLabel' | 'sourceUrl'>;
const NHB_FILE_SOURCE: ListSource = { source: NHB_SOURCE, url: NHB_DATABASE_URL };

export function ColdDirectoryPanel() {
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  // The official lists, read now: their own state, so the button never waits on anything else.
  const [reading, setReading] = useState(false);
  const [waited, setWaited] = useState(0);
  const [readError, setReadError] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [added, setAdded] = useState<Partial<Record<SourceState['id'], number>>>({});
  // The saved NHB file (when NHB cannot be reached) and a list in the Import
  // panel: each its own, so neither takes the other's file or source.
  const [nhbFile, setNhbFile] = useState<ListFile | null>(null);
  const [nhbSource, setNhbSource] = useState<ListSource>(NHB_FILE_SOURCE);
  const [file, setFile] = useState<ListFile | null>(null);
  const [onlyJK, setOnlyJK] = useState(true);
  const [text, setText] = useState('');
  const [importSource, setImportSource] = useState<ListSource>({ source: '', url: '' });
  const [one, setOne] = useState(blank);

  const load = useCallback(async () => {
    try {
      setRows(await directoryRows());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the directory.');
      setRows([]);
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

  // Seconds waited, shown while the lists are read.
  useEffect(() => {
    if (!reading) return;
    const started = Date.now();
    const timer = window.setInterval(() => setWaited(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [reading]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const readOfficial = async () => {
    setReading(true);
    setWaited(0);
    setReadError(null);
    try {
      let res: Response;
      try {
        res = await fetch('/api/cold-stores?fresh=1', { cache: 'no-store', signal: AbortSignal.timeout(READ_WAIT_MS) });
      } catch (err) {
        const slow = err instanceof Error && /timeout|abort/i.test(`${err.name} ${err.message}`);
        throw new Error(slow ? `The KashRoot server did not answer in ${READ_WAIT_MS / 1000} seconds.` : 'Could not reach the KashRoot server. Check your internet connection.');
      }
      const data = (await res.json().catch(() => null)) as (Live & { error?: string }) | null;
      if (res.status === 429) throw new Error(data?.error ?? 'The official list was read several times just now. Wait one minute.');
      if (!res.ok || !data?.sources) {
        throw new Error(res.status === 504 || res.status === 502 ? 'The KashRoot server took longer than 30 seconds and stopped.' : `The KashRoot server could not read the lists (error ${res.status}).`);
      }
      setLive(data);
      setAdded({});
    } catch (err) {
      setReadError(err instanceof Error ? err.message : 'The lists could not be read.');
    } finally {
      // Always: the button works again after an error.
      setReading(false);
    }
  };

  const addFrom = (entries: Row[], source: string, url: string | null, then?: (added: number) => void) =>
    run(async () => {
      const added = await importDirectory(entries.map(({ name, district, place, state, capacity_mt, phone, lat, lon }) => ({ name, district, place, state, capacity_mt, phone, lat, lon })), source, url);
      toast.success(`${added.toLocaleString('en-IN')} cold store${added === 1 ? '' : 's'} added${entries.length > added ? ` (${(entries.length - added).toLocaleString('en-IN')} were already in the directory)` : ''}`);
      then?.(added);
      await load();
    });

  /** A list read from a file or pasted: the saved NHB file is always Jammu & Kashmir only. */
  const read = (body: string, name: string, jk: boolean): ListFile => ({ name, parsed: parseColdStoreList(body, jk), onlyJK: jk });

  /** What was read from a file, with where it comes from and the Add button. */
  const preview = (f: ListFile, src: ListSource, setSrc: (s: ListSource) => void, done: () => void) =>
    f.parsed.problem ? (
      <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-900 ring-1 ring-rose-200">{f.name}: {f.parsed.problem}</p>
    ) : (
      <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-slate-800 ring-1 ring-slate-900/5">
        <p><strong>{f.parsed.entries.length.toLocaleString('en-IN')}</strong> cold stores read from {f.name} ({f.parsed.rows.toLocaleString('en-IN')} rows{f.onlyJK ? ', Jammu & Kashmir only' : ''}).</p>
        <ul className="list-disc pl-5 text-xs text-slate-600">
          {f.parsed.entries.slice(0, 5).map((e) => <li key={`${e.name}|${e.district}`}>{e.name}{e.district ? ` — ${e.district}` : ''}{e.capacity_mt ? ` — ${e.capacity_mt} MT` : ''}</li>)}
        </ul>
        <Field label="Where the list comes from (shown to farmers)">
          <input className={INPUT} value={src.source} onChange={(e) => setSrc({ ...src, source: e.target.value })} placeholder="e.g. NHB cold storage database, saved 17 Oct 2026" />
        </Field>
        <Field label="Link to the source (optional)">
          <input className={INPUT} value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} placeholder="https://…" />
        </Field>
        {src.source.trim().length < 2 && <p className="text-amber-900">Write where the list comes from, then tap Add.</p>}
        <Btn
          theme={theme}
          icon={Plus}
          className="min-h-11"
          disabled={busy || !f.parsed.entries.length || src.source.trim().length < 2}
          onClick={() => void addFrom(f.parsed.entries, src.source.trim(), /^https?:\/\//.test(src.url.trim()) ? src.url.trim() : null, done)}
        >
          Add {f.parsed.entries.length.toLocaleString('en-IN')} to the directory
        </Btn>
      </div>
    );

  /**
   * One source's answer: how many Jammu & Kashmir cold stores, or exactly why
   * it failed. A failed source still offers its last good copy (if the server
   * has one) and, for NHB, the saved-file import.
   */
  const sourceResult = (s: SourceState) => {
    const entries = live?.entries.filter((e) => e.source === s.id) ?? [];
    const nhb = s.id === 'nhb';
    const name = nhb ? 'National Horticulture Board (NHB)' : 'OpenStreetMap';
    const Icon = nhb ? Database : MapIcon;
    const where = nhb ? 'in the NHB list' : 'on OpenStreetMap';
    const add =
      added[s.id] !== undefined ? (
        <p className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="h-4 w-4" aria-hidden /> Added to the directory.</p>
      ) : (
        <Btn
          theme={theme}
          icon={Plus}
          className="min-h-11"
          disabled={busy}
          onClick={() => void addFrom(entries, nhb ? NHB_SOURCE : OSM_SOURCE, nhb ? NHB_DATABASE_URL : OSM_URL, (n) => setAdded((a) => ({ ...a, [s.id]: n })))}
        >
          Add the {entries.length.toLocaleString('en-IN')} {nhb ? 'NHB' : 'OpenStreetMap'} cold stores to the directory
        </Btn>
      );
    if (s.ok && entries.length > 0) {
      return (
        <li key={s.id} className="space-y-2 rounded-xl bg-emerald-50 p-3 text-emerald-950 ring-1 ring-emerald-200">
          <p className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 shrink-0" aria-hidden /> {name}</p>
          <p><strong>{entries.length.toLocaleString('en-IN')}</strong> cold stores in Jammu &amp; Kashmir {where}.</p>
          {add}
        </li>
      );
    }
    if (s.ok) {
      return (
        <li key={s.id} className="space-y-1 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-900/5">
          <p className="flex items-center gap-2 font-semibold text-slate-900"><Icon className="h-4 w-4 shrink-0" aria-hidden /> {name}</p>
          <p>{s.note ?? 'It answered, but it has no cold store in Jammu & Kashmir.'} Nothing to add.</p>
        </li>
      );
    }
    return (
      <li key={s.id} className="space-y-2 rounded-xl bg-amber-50 p-3 text-amber-950 ring-1 ring-amber-200">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {name}: could not be read{entries.length > 0 ? ' now' : ''}</p>
        <p>Reason: {s.error ?? 'no answer.'}</p>
        {entries.length > 0 && (
          <div className="space-y-2 rounded-lg bg-white/70 p-2.5 ring-1 ring-amber-200">
            <p>
              The last copy the KashRoot server read{s.at ? ` (${new Date(s.at).toLocaleString('en-IN')})` : ''} has <strong>{entries.length.toLocaleString('en-IN')}</strong> cold stores in Jammu &amp; Kashmir {where}.
            </p>
            {add}
          </div>
        )}
        {nhb ? (
          <>
            {s.fault === 'site' && <p>The problem is on the NHB website or the internet between, not in KashRoot.</p>}
            {s.fault === 'server' && <p>The KashRoot server could not get out to the NHB website. Ask the person who runs the KashRoot server to check its internet.</p>}
            <p>You can {entries.length > 0 ? 'also' : 'still'} add the official list yourself:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Open{' '}
                <a href={NHB_DATABASE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  the NHB cold storage database
                </a>{' '}
                in your browser.
              </li>
              <li>Save the Jammu &amp; Kashmir list as a file (CSV).</li>
              <li>Choose that file here:</li>
            </ol>
            <input
              type="file"
              accept=".csv,.txt,.json,.tsv,.xml,text/csv,application/json,text/plain,application/xml"
              aria-label="Saved NHB list file"
              className={FILE_INPUT}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void f.text().then((t) => setNhbFile(read(t, f.name, true)));
              }}
            />
            {nhbFile && preview(nhbFile, nhbSource, setNhbSource, () => {
              setNhbFile(null);
              setNhbSource(NHB_FILE_SOURCE);
            })}
          </>
        ) : (
          <p>OpenStreetMap is an extra list; the directory works without it. Try again in a few minutes.</p>
        )}
      </li>
    );
  };

  const checked = useMemo(() => (rows ?? []).filter((r) => r.status === 'approved'), [rows]);
  const suggestions = useMemo(() => (rows ?? []).filter((r) => r.status === 'pending'), [rows]);
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return checked.filter((r) => words.every((w) => `${r.name} ${r.district ?? ''} ${r.place ?? ''} ${r.source}`.toLowerCase().includes(w)));
  }, [checked, q]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {suggestions.length > 0 && (
        <Panel theme={theme} title={`Suggestions to check (${suggestions.length})`} icon={MessageSquarePlus} className="lg:col-span-2">
          <p className="mb-3 text-sm text-slate-700">Cold stores farmers and owners say are missing. Check each one (call or visit) — only then Approve, and every farmer sees it.</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {suggestions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500">
                    {[r.place, r.district].filter(Boolean).join(' · ')}
                    {r.phone ? <> · <a href={`tel:${r.phone}`} className="font-semibold text-violet-700">{r.phone}</a></> : null} · sent {new Date(r.created_at).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Btn theme={theme} size="sm" icon={Check} disabled={busy} onClick={() => void run(async () => { await approveSuggestion(r.id); toast.success(`${r.name} approved — farmers see it now`); await load(); })}>Approve</Btn>
                  <Btn theme={theme} size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => window.confirm(`Remove the suggestion “${r.name}”?`) && void run(async () => { await removeDirectoryEntry(r.id); await load(); })}>Remove</Btn>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel theme={theme} title="Official lists (NHB and OpenStreetMap)" icon={Database}>
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Farmers see every cold store in Jammu &amp; Kashmir, not only those on KashRoot. Tap the button: the KashRoot server reads the National Horticulture Board’s National Cold Storage database and OpenStreetMap. Then add what they have to the directory, so farmers keep it even when those websites are down.
          </p>
          <Btn theme={theme} icon={reading ? Loader2 : RefreshCw} className={`min-h-11 ${reading ? '[&>svg]:animate-spin' : ''}`} disabled={reading} aria-busy={reading} onClick={() => void readOfficial()}>
            {reading ? 'Reading…' : 'Read the official list now'}
          </Btn>
          {reading && (
            <p role="status" className="flex items-center gap-2 rounded-xl bg-violet-50 p-3 font-medium text-violet-950 ring-1 ring-violet-200">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span>Reading the official list… this can take up to 30 seconds.{waited > 0 ? ` (${waited} s)` : ''}</span>
            </p>
          )}
          {readError && !reading && (
            <div role="alert" className="space-y-1 rounded-xl bg-rose-50 p-3 text-rose-900 ring-1 ring-rose-200">
              <p className="font-semibold">The lists were not read.</p>
              <p>{readError}</p>
              <p>Tap “Read the official list now” to try again.</p>
            </div>
          )}
          {live && !reading && (
            <ul className="space-y-3" aria-label="What each list gave">
              {(['nhb', 'osm'] as const).map((id) => live.sources.find((s) => s.id === id)).filter((s): s is SourceState => Boolean(s)).map(sourceResult)}
            </ul>
          )}
        </div>
      </Panel>

      <Panel theme={theme} title="Import a list" icon={FileUp}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-700">A CSV or JSON file with a heading row — at least the cold store’s name; district, address, capacity (MT), phone and location are read when present.</p>
          <label className="flex min-h-11 items-center gap-2 text-slate-700">
            <input type="checkbox" className="h-5 w-5" checked={onlyJK} onChange={(e) => setOnlyJK(e.target.checked)} /> Only Jammu &amp; Kashmir
          </label>
          <input
            type="file"
            accept=".csv,.txt,.json,.tsv,.xml,text/csv,application/json,text/plain,application/xml"
            aria-label="Cold store list file"
            className={FILE_INPUT}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then((t) => setFile(read(t, f.name, onlyJK)));
            }}
          />
          <details>
            <summary className="cursor-pointer text-slate-600">Or paste the list</summary>
            <textarea className={`${INPUT} mt-2 h-28 font-mono text-xs`} aria-label="Pasted cold store list" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Name,District,Address,Capacity (MT)\n…'} />
            <Btn theme={theme} size="sm" variant="soft" className="mt-2" disabled={!text.trim()} onClick={() => setFile(read(text, 'Pasted list', onlyJK))}>Read the pasted list</Btn>
          </details>
          {file && preview(file, importSource, setImportSource, () => setFile(null))}
        </div>
      </Panel>

      <Panel theme={theme} title="Add one cold store" icon={Plus}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (one.name.trim().length < 2) return toast.error('Write the cold store’s name.');
            if (one.source.trim().length < 2) return toast.error('Say how you know it (the source).');
            const cap = Number(one.capacity);
            void run(async () => {
              await addDirectoryEntry({
                name: one.name.trim(),
                district: one.district || null,
                place: one.place.trim() || null,
                capacity_mt: one.capacity.trim() && cap >= 1 ? Math.round(cap) : null,
                phone: one.phone.replace(/\s/g, '') || null,
                lat: null,
                lon: null,
                source: one.source.trim(),
                source_url: /^https?:\/\//.test(one.sourceUrl.trim()) ? one.sourceUrl.trim() : null,
              });
              toast.success(`${one.name.trim()} added to the directory`);
              setOne(blank);
              await load();
            });
          }}
        >
          <Field label="Cold store name"><input className={INPUT} value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} /></Field>
          <Field label="District">
            <select className={INPUT} value={one.district} onChange={(e) => setOne({ ...one, district: e.target.value })}>
              <option value="">Choose…</option>
              {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Village / industrial area"><input className={INPUT} value={one.place} onChange={(e) => setOne({ ...one, place: e.target.value })} placeholder="e.g. IGC Lassipora" /></Field>
          <Field label="Capacity (MT, if known)"><input type="number" inputMode="numeric" min={1} className={INPUT} value={one.capacity} onChange={(e) => setOne({ ...one, capacity: e.target.value })} /></Field>
          <Field label="Phone (optional)"><input type="tel" inputMode="numeric" className={INPUT} value={one.phone} onChange={(e) => setOne({ ...one, phone: e.target.value })} /></Field>
          <Field label="Source (shown to farmers)"><input className={INPUT} value={one.source} onChange={(e) => setOne({ ...one, source: e.target.value })} /></Field>
          <Field label="Link to the source (optional)"><input className={INPUT} value={one.sourceUrl} onChange={(e) => setOne({ ...one, sourceUrl: e.target.value })} placeholder="https://…" /></Field>
          <div className="flex items-end"><Btn theme={theme} type="submit" icon={Plus} disabled={busy}>Add to the directory</Btn></div>
        </form>
      </Panel>

      <Panel theme={theme} title={`KashRoot directory${rows ? ` (${checked.length.toLocaleString('en-IN')})` : ''}`} icon={Warehouse}>
        <label className="relative mb-3 block">
          <span className="sr-only">Search the directory</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className={`${INPUT} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the directory" />
        </label>
        {rows === null ? (
          <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
        ) : checked.length === 0 ? (
          <EmptyState theme={theme} icon={Warehouse} title="Nothing in the directory yet" text="Read the official list, import a list or add a cold store. Farmers still see the official list live while it can be reached." />
        ) : (
          <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto text-sm">
            {shown.slice(0, 300).map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500">{[r.place, r.district, r.capacity_mt ? `${r.capacity_mt.toLocaleString('en-IN')} MT` : null].filter(Boolean).join(' · ')} — {r.source}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${r.name}`}
                  disabled={busy}
                  onClick={() => window.confirm(`Remove ${r.name} from the directory?`) && void run(async () => { await removeDirectoryEntry(r.id); await load(); })}
                  className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
