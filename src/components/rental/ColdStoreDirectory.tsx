'use client';

/**
 * All cold stores in Jammu & Kashmir — not only the ones on KashRoot — from
 * the National Horticulture Board's list and OpenStreetMap (read live by the
 * KashRoot server), the KashRoot directory (imported or added by the admin)
 * and the stores listed here by their owners (lib/coldDirectory). It has its
 * own search and district filter; a store on KashRoot can be booked from it.
 * Every entry says where it comes from. A cold store that is missing can be
 * suggested (the admin checks it first), and an owner can list their store
 * on KashRoot straight from its entry.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, ExternalLink, Loader2, MapPin, MessageSquarePlus, Phone, Search, Send, Snowflake, Store, Warehouse } from 'lucide-react';

import { Badge, Btn, Field, INPUT, PORTAL_THEMES } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import { mergeDirectory, SOURCE_LABEL, type DirEntry, type DirSource, type SourceState } from '@/lib/coldDirectory';
import { asEntry, directoryRows, suggestColdStore, type DirectoryRow } from '@/lib/db/coldDirectory';
import type { RentalListing } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
const PAGE = 60;
const DISTRICTS = ['Anantnag', 'Bandipora', 'Baramulla', 'Budgam', 'Doda', 'Ganderbal', 'Jammu', 'Kathua', 'Kishtwar', 'Kulgam', 'Kupwara', 'Poonch', 'Pulwama', 'Rajouri', 'Ramban', 'Reasi', 'Samba', 'Shopian', 'Srinagar', 'Udhampur'];

export type DirectoryItem = DirEntry & { also: DirSource[] };

/** The merged directory: KashRoot listings, the admin's entries and the live sources. */
export function useColdDirectory(listings: RentalListing[]) {
  const [live, setLive] = useState<{ entries: DirEntry[]; sources: SourceState[] } | null>(null);
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);

  useEffect(() => {
    let on = true;
    // The live lists can be slow (government websites): the page shows the
    // rest straight away and adds them when they come.
    fetch('/api/cold-stores', { signal: AbortSignal.timeout(35_000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { entries: DirEntry[]; sources: SourceState[] }) => on && setLive(d))
      .catch(() => on && setLive({ entries: [], sources: [] }));
    directoryRows()
      .then((r) => on && setRows(r))
      .catch(() => on && setRows([]));
    return () => {
      on = false;
    };
  }, []);
  const reload = useCallback(async () => setRows(await directoryRows().catch(() => [])), []);
  // Only checked entries are listed; the viewer's own suggestions wait for the admin.
  const checked = useMemo(() => (rows ?? []).filter((r) => r.status === 'approved'), [rows]);
  const waiting = useMemo(() => (rows ?? []).filter((r) => r.status === 'pending'), [rows]);

  const entries = useMemo<DirectoryItem[]>(() => {
    const own: DirEntry[] = listings.map((l) => ({
      name: l.title,
      district: l.district,
      place: l.address ?? null,
      state: 'Jammu & Kashmir',
      capacity_mt: null,
      phone: l.phone,
      lat: null,
      lon: null,
      source: 'kashroot',
      sourceLabel: SOURCE_LABEL.kashroot,
      sourceUrl: null,
      listingId: l.id,
    }));
    return mergeDirectory([own, checked.map(asEntry), live?.entries ?? []]);
  }, [listings, checked, live]);

  return { entries, sources: live?.sources ?? [], loading: rows === null, reading: live === null, adminCount: checked.length, waiting, reload };
}

/** Where an entry comes from, each source once ("National Horticulture Board" inside a longer name counts as said). */
function sourcesOf(e: DirectoryItem): string[] {
  const labels = [e.source === 'admin' ? e.sourceLabel : SOURCE_LABEL[e.source], ...e.also.map((s) => SOURCE_LABEL[s])];
  return labels.filter((l, i) => labels.indexOf(l) === i && !labels.some((o) => o !== l && o.includes(l)));
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function ColdStoreDirectory({
  entries,
  sources,
  loading,
  reading,
  adminCount,
  waiting,
  reload,
  listings,
  onBook,
  onClaim,
}: {
  entries: DirectoryItem[];
  sources: SourceState[];
  /** The KashRoot directory is still loading. */
  loading: boolean;
  /** The official list and OpenStreetMap are still being read. */
  reading: boolean;
  adminCount: number;
  /** The viewer's suggestions that wait for the admin's check. */
  waiting: DirectoryRow[];
  reload: () => Promise<void>;
  listings: RentalListing[];
  onBook: (l: RentalListing) => void;
  /** "Your cold store? List it on KashRoot" — opens My cold store with its details. */
  onClaim: (e: DirectoryItem) => void;
}) {
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [shown, setShown] = useState(PAGE);
  const byId = useMemo(() => new Map(listings.map((l) => [l.id, l])), [listings]);

  const districts = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of entries) if (e.district) n.set(e.district, (n.get(e.district) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  const found = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((e) => {
      if (district && e.district !== district) return false;
      const text = `${e.name} ${e.place ?? ''} ${e.district ?? ''}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [entries, q, district]);
  const onKashRoot = entries.filter((e) => e.listingId).length;

  return (
    <section aria-label="All cold stores in Jammu and Kashmir" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-sans text-xl font-semibold text-slate-900">All cold stores in Jammu &amp; Kashmir</h2>
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{entries.length.toLocaleString('en-IN')}</strong> cold store{entries.length === 1 ? '' : 's'} found · <strong className="text-emerald-800">{onKashRoot}</strong> on KashRoot, ready to book
          </p>
          <p className="mt-1 text-xs text-slate-500">Stores on KashRoot show every chamber on a floor plan and in 3D, and you choose your own place. The others are listed so you know they exist — their owner can join with “Your store? List it”.</p>
          {reading && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Reading the official list (National Horticulture Board) and OpenStreetMap — more stores appear here when they arrive.
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative block">
          <span className="sr-only">Search all cold stores</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            className={`${INPUT} pl-9`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search all cold stores: name, village or district"
          />
        </label>
        <label>
          <span className="sr-only">District</span>
          <select
            className={INPUT}
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              setShown(PAGE);
            }}
          >
            <option value="">All districts</option>
            {districts.map(([d, n]) => <option key={d} value={d}>{d} ({n})</option>)}
          </select>
        </label>
      </div>

      {!loading && !reading && entries.length === 0 ? (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> The cold store lists could not be loaded just now. KashRoot tries the official list again automatically — please look again in a while.
        </p>
      ) : !loading && entries.length > 0 && found.length === 0 ? (
        <p className="rounded-2xl bg-white/80 p-4 text-sm text-slate-700 ring-1 ring-slate-900/5">No cold store matches “{q.trim() || district}”. Try another spelling, or All districts.</p>
      ) : (
        <>
          {!loading && <p className="text-xs text-slate-500">Showing {Math.min(shown, found.length).toLocaleString('en-IN')} of {found.length.toLocaleString('en-IN')}</p>}
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {found.slice(0, shown).map((e, i) => {
              const listing = e.listingId ? byId.get(e.listingId) : undefined;
              const where = [e.place, e.district].filter(Boolean).join(' · ');
              return (
                <li key={`${e.listingId ?? e.source}:${e.name}:${e.district ?? ''}:${i}`} className={`flex flex-col rounded-2xl bg-white/85 p-4 shadow-sm ring-1 ${listing ? 'ring-emerald-300' : 'ring-slate-900/5'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-start gap-1.5 font-semibold text-slate-900">
                      {listing ? <Snowflake className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
                      {e.name}
                    </p>
                    {listing && <Badge tone="violet">On KashRoot</Badge>}
                  </div>
                  {where && <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {where}</p>}
                  {listing ? (
                    <p className="mt-1 text-sm text-slate-700"><strong>{listing.available.toLocaleString('en-IN')}</strong> of {listing.capacity.toLocaleString('en-IN')} boxes free</p>
                  ) : e.capacity_mt ? (
                    <p className="mt-1 text-sm text-slate-700">Capacity {e.capacity_mt.toLocaleString('en-IN')} MT</p>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">Source: {sourcesOf(e).join(' · ')}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-sm">
                    {listing && <Btn theme={theme} size="sm" onClick={() => onBook(listing)}>Choose your place</Btn>}
                    {!listing && (
                      <button type="button" onClick={() => onClaim(e)} className="inline-flex cursor-pointer items-center gap-1 font-semibold text-emerald-700 hover:underline">
                        <Store className="h-3.5 w-3.5" aria-hidden /> Your store? List it
                      </button>
                    )}
                    {e.phone && <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Phone className="h-3.5 w-3.5" aria-hidden /> Call</a>}
                    {e.lat !== null && e.lon !== null && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-800">
                        <MapPin className="h-3.5 w-3.5" aria-hidden /> Map
                      </a>
                    )}
                    {e.sourceUrl && e.source !== 'nhb' && (
                      <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800">
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Source
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {found.length > shown && (
            <div className="text-center">
              <Btn theme={theme} variant="soft" onClick={() => setShown((n) => n + PAGE)}>Show more ({(found.length - shown).toLocaleString('en-IN')} left)</Btn>
            </div>
          )}
        </>
      )}

      <SuggestStore waiting={waiting} reload={reload} />

      {!loading && !reading && (
        <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-900/5">
          <p className="font-semibold text-slate-700">Where this list comes from</p>
          <ul className="mt-1 space-y-0.5">
            {sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2">{s.id === 'nhb' ? 'National Horticulture Board — National Cold Storage database' : 'OpenStreetMap — the community map'}</a>
                {': '}
                {s.ok ? `${s.count.toLocaleString('en-IN')} in Jammu & Kashmir${s.at ? ` (read ${when(s.at)})` : ''}` : s.count ? `${s.count.toLocaleString('en-IN')} from the last copy (${when(s.at)}); could not be reached just now` : 'could not be reached just now — KashRoot tries again automatically'}
              </li>
            ))}
            <li>KashRoot directory (checked and added by the KashRoot team): {adminCount.toLocaleString('en-IN')}</li>
            <li>On KashRoot (listed by the owners, bookable): {onKashRoot.toLocaleString('en-IN')}</li>
          </ul>
          <p className="mt-1">Names are shown as each source publishes them. A store that appears in several lists is shown once.</p>
        </div>
      )}
    </section>
  );
}

/** "Missing a cold store? Tell us" — it waits for the KashRoot team's check, then everyone sees it. */
function SuggestStore({ waiting, reload }: { waiting: DirectoryRow[]; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', district: '', place: '', phone: '' });
  const send = async () => {
    if (form.name.trim().length < 2) return toast.error('Write the cold store’s name.');
    if (!form.district) return toast.error('Choose the district.');
    setBusy(true);
    try {
      await suggestColdStore({ name: form.name.trim(), district: form.district, place: form.place.trim() || null, phone: form.phone.replace(/\s/g, '') || null });
      toast.success('Thank you — the KashRoot team checks it, then everyone sees it.');
      setForm({ name: '', district: '', place: '', phone: '' });
      setOpen(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send it.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Suggest a cold store" className="rounded-2xl bg-emerald-50/70 p-4 text-sm ring-1 ring-emerald-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-start gap-2 text-emerald-950">
          <MessageSquarePlus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><strong>Missing a cold store?</strong> Tell us its name and place — the KashRoot team checks it, then every farmer sees it.</span>
        </p>
        {!open && <Btn theme={theme} size="sm" variant="soft" onClick={() => setOpen(true)}>Suggest a cold store</Btn>}
      </div>
      {open && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            void send();
          }}
        >
          <Field label="Cold store name"><input className={INPUT} value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} placeholder="e.g. … CA Store" /></Field>
          <Field label="District">
            <select className={INPUT} value={form.district} onChange={(ev) => setForm({ ...form, district: ev.target.value })}>
              <option value="">Choose…</option>
              {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Village / industrial area"><input className={INPUT} value={form.place} onChange={(ev) => setForm({ ...form, place: ev.target.value })} placeholder="e.g. IGC Lassipora" /></Field>
          <Field label="Phone (if you know it)"><input type="tel" className={INPUT} value={form.phone} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} /></Field>
          <div className="flex gap-2 sm:col-span-2">
            <Btn theme={theme} type="submit" icon={Send} disabled={busy}>{busy ? 'Sending…' : 'Send'}</Btn>
            <Btn theme={theme} variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          </div>
        </form>
      )}
      {waiting.length > 0 && (
        <p className="mt-2 text-xs text-emerald-900">
          Waiting for the KashRoot team’s check: {waiting.map((w) => `${w.name}${w.district ? ` (${w.district})` : ''}`).join(' · ')}
        </p>
      )}
    </section>
  );
}
