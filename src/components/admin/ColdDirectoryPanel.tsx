'use client';

/**
 * Admin → Cold stores: the directory of all cold stores farmers see in the
 * Cold Storage portal (besides the stores listed on KashRoot).
 *   • Official list — read the National Horticulture Board's list now and
 *     add its Jammu & Kashmir cold stores to the directory.
 *   • Import a list — a CSV / JSON file (e.g. the NHB file saved from its
 *     website, or a MoFPI / DMI list), always with where it comes from.
 *   • Add one — a cold store checked by the KashRoot team.
 *   • The directory — search, and remove an entry.
 * Nothing is added without a source.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, FileUp, Loader2, Plus, RefreshCw, Search, Trash2, Warehouse } from 'lucide-react';

import { Btn, EmptyState, Field, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import { NHB_DATABASE_URL, parseColdStoreList, type DirEntry, type ParsedList, type SourceState } from '@/lib/coldDirectory';
import { addDirectoryEntry, directoryRows, importDirectory, removeDirectoryEntry, type DirectoryRow } from '@/lib/db/coldDirectory';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;
const DISTRICTS = ['Anantnag', 'Bandipora', 'Baramulla', 'Budgam', 'Doda', 'Ganderbal', 'Jammu', 'Kathua', 'Kishtwar', 'Kulgam', 'Kupwara', 'Poonch', 'Pulwama', 'Rajouri', 'Ramban', 'Reasi', 'Samba', 'Shopian', 'Srinagar', 'Udhampur'];
const NHB_SOURCE = 'National Horticulture Board — National Cold Storage database';
const blank = { name: '', district: '', place: '', capacity: '', phone: '', source: 'Checked by the KashRoot team', sourceUrl: '' };

export function ColdDirectoryPanel() {
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  // The official list, read now.
  const [live, setLive] = useState<{ entries: DirEntry[]; sources: SourceState[] } | null>(null);
  // A list to import.
  const [file, setFile] = useState<{ name: string; parsed: ParsedList } | null>(null);
  const [onlyJK, setOnlyJK] = useState(true);
  const [text, setText] = useState('');
  const [importSource, setImportSource] = useState({ source: '', url: '' });
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

  const readOfficial = () =>
    run(async () => {
      const res = await fetch('/api/cold-stores?fresh=1');
      if (!res.ok) throw new Error('The KashRoot server could not read the lists.');
      setLive((await res.json()) as { entries: DirEntry[]; sources: SourceState[] });
    });
  const nhb = live?.entries.filter((e) => e.source === 'nhb') ?? [];
  const nhbState = live?.sources.find((s) => s.id === 'nhb');

  const addFrom = (entries: Omit<DirEntry, 'source' | 'sourceLabel' | 'sourceUrl'>[], source: string, url: string | null) =>
    run(async () => {
      const added = await importDirectory(entries.map(({ name, district, place, state, capacity_mt, phone, lat, lon }) => ({ name, district, place, state, capacity_mt, phone, lat, lon })), source, url);
      toast.success(`${added.toLocaleString('en-IN')} cold store${added === 1 ? '' : 's'} added${entries.length > added ? ` (${(entries.length - added).toLocaleString('en-IN')} were already in the directory)` : ''}`);
      await load();
    });

  const parse = (body: string, name: string) => setFile({ name, parsed: parseColdStoreList(body, onlyJK) });

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (rows ?? []).filter((r) => words.every((w) => `${r.name} ${r.district ?? ''} ${r.place ?? ''} ${r.source}`.toLowerCase().includes(w)));
  }, [rows, q]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel theme={theme} title="Official list (National Horticulture Board)" icon={Database}>
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Farmers see every cold store in Jammu &amp; Kashmir, not only those on KashRoot. The KashRoot server reads the National Horticulture Board’s National Cold Storage database (and OpenStreetMap) by itself; saving the official list here keeps it even when that website is down.
          </p>
          <Btn theme={theme} icon={RefreshCw} disabled={busy} onClick={() => void readOfficial()}>Read the official list now</Btn>
          {nhbState && (
            nhbState.ok || nhb.length ? (
              <div className="space-y-2 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                <p><strong>{nhb.length.toLocaleString('en-IN')}</strong> cold stores in Jammu &amp; Kashmir in the NHB list{nhbState.ok ? '' : ' (last copy — the site did not answer now)'}.</p>
                {nhb.length > 0 && <Btn theme={theme} size="sm" icon={Plus} disabled={busy} onClick={() => void addFrom(nhb, NHB_SOURCE, NHB_DATABASE_URL)}>Add them to the directory</Btn>}
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-amber-950 ring-1 ring-amber-200">
                The NHB website could not be reached from the KashRoot server ({nhbState.error}). Open{' '}
                <a href={NHB_DATABASE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">the NHB cold storage database</a>
                {' '}in your browser, save the Jammu &amp; Kashmir list (CSV), and import it on the right.
              </p>
            )
          )}
        </div>
      </Panel>

      <Panel theme={theme} title="Import a list" icon={FileUp}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-700">A CSV or JSON file with a heading row — at least the cold store’s name; district, address, capacity (MT), phone and location are read when present.</p>
          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" checked={onlyJK} onChange={(e) => setOnlyJK(e.target.checked)} /> Only Jammu &amp; Kashmir
          </label>
          <input
            type="file"
            accept=".csv,.txt,.json,.tsv,text/csv,application/json,text/plain"
            aria-label="Cold store list file"
            className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:font-semibold file:text-violet-900"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then((t) => parse(t, f.name));
            }}
          />
          <details>
            <summary className="cursor-pointer text-slate-600">Or paste the list</summary>
            <textarea className={`${INPUT} mt-2 h-28 font-mono text-xs`} aria-label="Pasted cold store list" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Name,District,Address,Capacity (MT)\n…'} />
            <Btn theme={theme} size="sm" variant="soft" className="mt-2" disabled={!text.trim()} onClick={() => parse(text, 'pasted list')}>Read the pasted list</Btn>
          </details>
          {file && (
            file.parsed.problem ? (
              <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-900 ring-1 ring-rose-200">{file.name}: {file.parsed.problem}</p>
            ) : (
              <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-900/5">
                <p><strong>{file.parsed.entries.length.toLocaleString('en-IN')}</strong> cold stores read from {file.name} ({file.parsed.rows.toLocaleString('en-IN')} rows{onlyJK ? ', Jammu & Kashmir only' : ''}).</p>
                <ul className="list-disc pl-5 text-xs text-slate-600">
                  {file.parsed.entries.slice(0, 5).map((e) => <li key={`${e.name}|${e.district}`}>{e.name}{e.district ? ` — ${e.district}` : ''}{e.capacity_mt ? ` — ${e.capacity_mt} MT` : ''}</li>)}
                </ul>
                <Field label="Where the list comes from (shown to farmers)">
                  <input className={INPUT} value={importSource.source} onChange={(e) => setImportSource({ ...importSource, source: e.target.value })} placeholder="e.g. NHB cold storage database, saved 17 Oct 2026" />
                </Field>
                <Field label="Link to the source (optional)">
                  <input className={INPUT} value={importSource.url} onChange={(e) => setImportSource({ ...importSource, url: e.target.value })} placeholder="https://…" />
                </Field>
                <Btn
                  theme={theme}
                  size="sm"
                  icon={Plus}
                  disabled={busy || !file.parsed.entries.length || importSource.source.trim().length < 2}
                  onClick={() => void addFrom(file.parsed.entries, importSource.source.trim(), /^https?:\/\//.test(importSource.url.trim()) ? importSource.url.trim() : null).then(() => setFile(null))}
                >
                  Add {file.parsed.entries.length.toLocaleString('en-IN')} to the directory
                </Btn>
              </div>
            )
          )}
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
          <Field label="Capacity (MT, if known)"><input type="number" min={1} className={INPUT} value={one.capacity} onChange={(e) => setOne({ ...one, capacity: e.target.value })} /></Field>
          <Field label="Phone (optional)"><input type="tel" className={INPUT} value={one.phone} onChange={(e) => setOne({ ...one, phone: e.target.value })} /></Field>
          <Field label="Source (shown to farmers)"><input className={INPUT} value={one.source} onChange={(e) => setOne({ ...one, source: e.target.value })} /></Field>
          <Field label="Link to the source (optional)"><input className={INPUT} value={one.sourceUrl} onChange={(e) => setOne({ ...one, sourceUrl: e.target.value })} placeholder="https://…" /></Field>
          <div className="flex items-end"><Btn theme={theme} type="submit" icon={Plus} disabled={busy}>Add to the directory</Btn></div>
        </form>
      </Panel>

      <Panel theme={theme} title={`KashRoot directory${rows ? ` (${rows.length.toLocaleString('en-IN')})` : ''}`} icon={Warehouse}>
        <label className="relative mb-3 block">
          <span className="sr-only">Search the directory</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className={`${INPUT} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the directory" />
        </label>
        {rows === null ? (
          <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
        ) : rows.length === 0 ? (
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
                  className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
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
