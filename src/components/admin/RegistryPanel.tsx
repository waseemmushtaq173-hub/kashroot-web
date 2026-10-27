'use client';

/**
 * Admin → Official lists: the Government lists of registered products that
 * KashRoot TrueScan checks labels against (official_products).
 *   • The lists on KashRoot — each with what it holds, its source and link,
 *     how many products and when it was imported; remove a list.
 *   • Import a list — the CIB&RC list of registered pesticides or a
 *     Fertiliser (Control) Order list, saved as CSV (from Excel: Save As →
 *     CSV). The rows are read and shown first; the list's name and link are
 *     required; it is sent in batches while the progress is shown. A newer
 *     copy of a list replaces the older one.
 * Nothing is added without its source, and KashRoot never types in a
 * registration itself.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, FileUp, ListChecks, Loader2, Trash2, Upload } from 'lucide-react';

import { Badge, Btn, EmptyState, Field, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import { decodeListFile, KIND_LABEL, parseOfficialList, type OfficialKind, type ParsedOfficialList } from '@/lib/fertilizer/officialList';
import { importRegistry, registryStats, removeRegistryList, type OfficialListInfo, type RegistryStats } from '@/lib/db/registry';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;
const KINDS: OfficialKind[] = ['pesticide', 'fertiliser', 'seed', 'other'];
const FILE_INPUT = 'block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:font-semibold file:text-emerald-900';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const count = (n: number) => n.toLocaleString('en-IN');
/** "1 product", "1,234 products" */
const products = (n: number) => `${count(n)} product${n === 1 ? '' : 's'}`;

type ListFile = { name: string; parsed: ParsedOfficialList };
type Progress = { step: 'removing' | 'importing'; done: number; total: number };

export function RegistryPanel() {
  // undefined: loading; null: the TrueScan SQL has not been run on this database.
  const [stats, setStats] = useState<RegistryStats | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<OfficialKind>('pesticide');
  const [file, setFile] = useState<ListFile | null>(null);
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [url, setUrl] = useState('');
  const [replace, setReplace] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await registryStats(true));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read the official lists.');
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

  const choose = async (f?: File) => {
    if (!f) return;
    setImportError(null);
    const decoded = decodeListFile(await f.arrayBuffer());
    setFile({ name: f.name, parsed: 'problem' in decoded ? { rows: [], read: 0, skipped: 0, columns: {}, problem: decoded.problem } : parseOfficialList(decoded.text) });
  };

  const name = source.trim();
  const link = url.trim();
  const linkOk = /^https?:\/\/\S+\.\S+/.test(link);
  const older = stats?.lists.find((l) => l.kind === kind && l.source === name);
  const rows = file?.parsed.rows ?? [];

  const runImport = async () => {
    if (!file || !rows.length || name.length < 2 || !linkOk) return;
    setImportError(null);
    try {
      let removed = 0;
      if (older && replace) {
        setProgress({ step: 'removing', done: 0, total: rows.length });
        removed = await removeRegistryList(older.source, older.kind);
      }
      setProgress({ step: 'importing', done: 0, total: rows.length });
      const added = await importRegistry(rows, kind, name, link, (done) => setProgress({ step: 'importing', done, total: rows.length }));
      const kept = rows.length - added;
      toast.success(
        `${products(added)} imported to “${name}”${removed ? ` (the older copy, ${products(removed)}, was replaced)` : kept > 0 ? ` (${count(kept)} ${kept === 1 ? 'was' : 'were'} already in this list or repeated in the file)` : ''}`,
      );
      setFile(null);
      setText('');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not import the list.';
      setImportError(message);
      toast.error(message);
      await load();
    } finally {
      setProgress(null);
    }
  };

  const remove = async (l: OfficialListInfo) => {
    if (!window.confirm(`Remove the list “${l.source}” (${products(l.count)})? TrueScan will no longer find them.`)) return;
    setRemoving(`${l.kind}|${l.source}`);
    try {
      const n = await removeRegistryList(l.source, l.kind);
      toast.success(`“${l.source}” removed (${products(n)})`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the list.');
    } finally {
      setRemoving(null);
    }
  };

  const total = stats?.total ?? 0;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel theme={theme} title={`Official lists on KashRoot${stats ? ` (${products(total)})` : ''}`} icon={ListChecks}>
        <p className="mb-3 text-sm text-slate-700">
          KashRoot TrueScan checks a registration number or product name against these lists, and shows each answer with the list’s name, link and date. The Government publishes no list of batch numbers.
        </p>
        {loadError ? (
          <div role="alert" className="space-y-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">
            <p>{loadError}</p>
            <Btn theme={theme} size="sm" variant="soft" className="min-h-11" onClick={() => void load()}>Try again</Btn>
          </div>
        ) : stats === undefined ? (
          <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
        ) : stats === null ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">The official lists are not set up in the database yet. Open the Setup check tab to see which setup file to run in Supabase.</p>
        ) : stats.lists.length === 0 ? (
          <EmptyState theme={theme} icon={ListChecks} title="No official list yet" text="Import the CIB&RC list of registered pesticides (as CSV) here. Until a list is imported, TrueScan tells people it cannot check registrations yet." />
        ) : (
          <>
            <p className="mb-3 flex flex-wrap gap-2">
              {KINDS.filter((k) => stats.kinds[k]?.count).map((k) => (
                <Badge key={k} tone="violet">{KIND_LABEL[k]}: {count(stats.kinds[k]!.count)}</Badge>
              ))}
            </p>
            {stats.last_import && <p className="mb-3 text-sm text-slate-700">Last import: <strong>{day(stats.last_import)}</strong></p>}
            <ul className="divide-y divide-slate-100 text-sm" aria-label="Official lists">
              {stats.lists.map((l) => (
                <li key={`${l.kind}|${l.source}`} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{l.source}</p>
                    <p className="text-xs text-slate-600">{KIND_LABEL[l.kind]} · {products(l.count)} · imported {day(l.imported_at)}</p>
                    <a href={l.source_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 break-all text-xs font-medium text-emerald-800 underline">
                      {l.source_url} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    </a>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove the list ${l.source}`}
                    disabled={removing !== null || progress !== null}
                    onClick={() => void remove(l)}
                    className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {removing === `${l.kind}|${l.source}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel theme={theme} title="Import an official list" icon={FileUp}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-700">
            A CSV file with a heading row: the product (or chemical) name, and the registration number (CIR No) and registrant company when the list has them. From Excel: File → Save As → CSV. Title lines above the headings are skipped.
          </p>
          <Field label="What is in the list?">
            <select className={`${INPUT} min-h-11`} value={kind} onChange={(e) => setKind(e.target.value as OfficialKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </Field>
          <input
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/plain,text/tab-separated-values"
            aria-label="Official list file (CSV)"
            className={FILE_INPUT}
            disabled={progress !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Emptied again, so choosing the same file later (a newer copy) is read too.
              e.target.value = '';
              void choose(f);
            }}
          />
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center text-slate-600">Or paste the list</summary>
            <textarea className={`${INPUT} mt-2 h-28 font-mono text-xs`} aria-label="Pasted official list" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Registration No,Product,Registrant\n…'} />
            <Btn theme={theme} size="sm" variant="soft" className="mt-2 min-h-11" disabled={!text.trim() || progress !== null} onClick={() => { setImportError(null); setFile({ name: 'the pasted list', parsed: parseOfficialList(text) }); }}>
              Read the pasted list
            </Btn>
          </details>

          {file?.parsed.problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-900 ring-1 ring-rose-200">{file.name}: {file.parsed.problem}</p>}

          {file && !file.parsed.problem && (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3 text-slate-800 ring-1 ring-slate-900/5">
              <p>
                <strong>{count(rows.length)}</strong> product{rows.length === 1 ? '' : 's'} read from {file.name} ({count(file.parsed.read)} row{file.parsed.read === 1 ? '' : 's'}{file.parsed.skipped ? `; ${count(file.parsed.skipped)} without a product name left out` : ''}).
              </p>
              <p className="text-xs text-slate-600">
                Product: “{file.parsed.columns.name}” · Registration no.: {file.parsed.columns.registration ? `“${file.parsed.columns.registration}”` : 'none in this list'} · Company: {file.parsed.columns.registrant ? `“${file.parsed.columns.registrant}”` : 'none in this list'}
              </p>
              <ul className="space-y-1.5 text-xs" aria-label="First rows of the list">
                {rows.slice(0, 5).map((r, i) => (
                  <li key={`${r.registration_no}|${r.name}|${i}`} className="rounded-lg bg-white p-2 ring-1 ring-slate-900/5">
                    <span className="font-semibold text-slate-900">{r.name}</span>
                    {r.registrant && <span className="text-slate-700"> — {r.registrant}</span>}
                    {r.registration_no && <span className="block break-all text-slate-600">{r.registration_no}</span>}
                  </li>
                ))}
              </ul>
              {rows.length > 5 && <p className="text-xs text-slate-500">…and {count(rows.length - 5)} more.</p>}
              <Field label="Name of the list (shown to everyone)" hint="Say whose list it is and when you saved it.">
                <input className={INPUT} value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} placeholder="e.g. CIB&RC — registered products, saved 26 Oct 2026" />
              </Field>
              <Field label="Link to the list (required)" hint="The page where the Government publishes it.">
                <input className={INPUT} type="url" inputMode="url" value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </Field>
              {older && (
                <label className="flex min-h-11 items-start gap-2 text-slate-700">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                  <span>Replace the copy imported on {day(older.imported_at)} ({products(older.count)}) — products no longer in the new file are removed.</span>
                </label>
              )}
              {name.length < 2 && <p className="text-amber-900">Write the name of the list, then tap Import.</p>}
              {name.length >= 2 && !linkOk && <p className="text-amber-900">Add the link where the list is published — it starts with https://</p>}
              {progress && (
                <div role="status" className="space-y-1.5 rounded-lg bg-emerald-50 p-2.5 text-emerald-950 ring-1 ring-emerald-200">
                  <p className="flex items-center gap-2 font-medium">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    {progress.step === 'removing' ? 'Removing the older copy…' : `Importing… ${count(progress.done)} of ${count(progress.total)}`}
                  </p>
                  <progress className="h-2 w-full accent-emerald-700" max={progress.total} value={progress.done} aria-label="Import progress" />
                </div>
              )}
              {importError && !progress && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-2.5 text-rose-900 ring-1 ring-rose-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {importError}
                </p>
              )}
              <Btn theme={theme} icon={Upload} className="min-h-11" disabled={progress !== null || !rows.length || name.length < 2 || !linkOk} onClick={() => void runImport()}>
                Import {products(rows.length)}
              </Btn>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
