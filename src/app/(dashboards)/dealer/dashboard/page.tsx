'use client';

/**
 * Agro-dealer portal — batch-coded inventory, licence compliance, batch
 * manifest upload to the authenticity registry, and payouts.
 *
 * Data lives in the browser (kr_dealer_*) until a dealer API exists. The
 * manifest is read locally (CSV: name,batch,expiry,stock) and never uploaded.
 */
import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  FileUp,
  FlaskConical,
  Minus,
  PackageSearch,
  Plus,
  PlusCircle,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { PayoutPanel } from '@/components/portal/PayoutPanel';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel, Tile } from '@/components/portal/kit';
import { localId, usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.dealer;

interface Batch {
  id: string;
  name: string;
  batch: string;
  expiry: string;
  stock: number;
  registered: boolean;
}

interface Licence {
  id: string;
  name: string;
  file?: string;
  verified: boolean;
}

const SEED_BATCHES: Batch[] = [
  { id: 'B-1', name: 'Mancozeb 75% WP (1 kg)', batch: 'MZ-24-1187', expiry: '2027-03-31', stock: 140, registered: true },
  { id: 'B-2', name: 'Horticultural mineral oil (5 L)', batch: 'HMO-25-0442', expiry: '2027-08-15', stock: 36, registered: false },
  { id: 'B-3', name: 'Calcium nitrate (25 kg)', batch: 'CN-25-2290', expiry: '2026-11-30', stock: 18, registered: false },
];

const SEED_LICENCES: Licence[] = [
  { id: 'L-1', name: 'Insecticide selling licence', verified: true, file: 'licence-insecticide.pdf' },
  { id: 'L-2', name: 'Fertiliser dealer registration', verified: false },
  { id: 'L-3', name: 'Seed dealer licence', verified: false },
  { id: 'L-4', name: 'GST registration certificate', verified: false },
];

const daysUntil = (date: string) => Math.ceil((Date.parse(date) - Date.now()) / 86_400_000);

const EMPTY_BATCH = { name: '', batch: '', expiry: '', stock: '' };

export default function DealerDashboardPage() {
  const [tab, setTab] = useState('inventory');
  const [batches, setBatches] = usePersistentState<Batch[]>('kr_dealer_batches', SEED_BATCHES);
  const [licences, setLicences] = usePersistentState<Licence[]>('kr_dealer_licences', SEED_LICENCES);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_BATCH);
  const manifestInput = useRef<HTMLInputElement>(null);
  const licenceInput = useRef<HTMLInputElement>(null);
  const [licenceTarget, setLicenceTarget] = useState<string | null>(null);

  const unregistered = batches.filter((b) => !b.registered);
  const expiring = batches.filter((b) => daysUntil(b.expiry) <= 60);
  const compliant = licences.filter((l) => l.verified).length;

  const addBatch = () => {
    const stock = Number(draft.stock);
    if (!draft.name.trim() || !draft.batch.trim() || !draft.expiry || !(stock >= 0)) return toast.error('Fill product, batch code, expiry and stock.');
    setBatches((all) => [{ id: localId('B'), name: draft.name.trim(), batch: draft.batch.trim().toUpperCase(), expiry: draft.expiry, stock, registered: false }, ...all]);
    setDraft(EMPTY_BATCH);
    setAddOpen(false);
    toast.success('Batch added — register it so farmers can verify it');
  };

  const registerAll = () => {
    if (unregistered.length === 0) return toast.info('Every batch is already registered.');
    setBatches((all) => all.map((b) => ({ ...b, registered: true })));
    toast.success(`${unregistered.length} batch code(s) registered`);
  };

  const readManifest = async (file: File) => {
    const rows = (await file.text())
      .split(/\r?\n/)
      .map((line) => line.split(',').map((c) => c.trim()))
      .filter((c) => c.length >= 4 && c[0] && !/^name$/i.test(c[0]));
    const parsed: Batch[] = rows
      .filter(([, batch, expiry, stock]) => batch && !Number.isNaN(Date.parse(expiry)) && Number(stock) >= 0)
      .map(([name, batch, expiry, stock]) => ({ id: localId('B'), name, batch: batch.toUpperCase(), expiry, stock: Number(stock), registered: true }));
    if (parsed.length === 0) return toast.error('No valid rows. Use CSV columns: name,batch,expiry (YYYY-MM-DD),stock');
    setBatches((all) => [...parsed, ...all.filter((b) => !parsed.some((p) => p.batch === b.batch))]);
    toast.success(`${parsed.length} batch(es) imported and registered from ${file.name}`);
  };

  const attachLicence = (file: File) => {
    if (!licenceTarget) return;
    setLicences((all) => all.map((l) => (l.id === licenceTarget ? { ...l, file: file.name, verified: true } : l)));
    toast.success(`${file.name} attached`);
    setLicenceTarget(null);
  };

  return (
    <PortalShell
      title="Agro-dealer portal"
      description="Keep every agrochemical batch traceable, licences current, and payouts flowing."
      eyebrow="Dealer"
      theme="dealer"
      kpis={[
        { label: 'Batches in stock', value: String(batches.length), trend: `${batches.reduce((s, b) => s + b.stock, 0)} units` },
        { label: 'Unregistered', value: String(unregistered.length), trend: unregistered.length ? 'Farmers cannot verify these' : 'All verifiable' },
        { label: 'Compliance', value: `${compliant}/${licences.length}`, trend: 'Licences on file' },
        { label: 'Expiring ≤ 60 days', value: String(expiring.length), trend: 'Sell or return first' },
      ]}
      tabs={[
        { id: 'inventory', label: 'Inventory', icon: FlaskConical, count: batches.length },
        { id: 'compliance', label: 'Compliance', icon: ClipboardCheck },
        { id: 'payouts', label: 'Payouts', icon: Banknote },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      actions={
        <>
          <Btn theme={theme} variant="white" icon={FileUp} onClick={() => manifestInput.current?.click()}>Upload batch manifest</Btn>
          <Btn theme={theme} variant="white" icon={PlusCircle} onClick={() => setAddOpen(true)}>Add batch</Btn>
        </>
      }
    >
      <input
        ref={manifestInput}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        aria-label="Batch manifest CSV"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void readManifest(file);
          e.target.value = '';
        }}
      />
      <input
        ref={licenceInput}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        aria-label="Licence document"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) attachLicence(file);
          e.target.value = '';
        }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Tile theme={theme} icon={PackageSearch} label="Batch tester" hint="Check any code the way farmers do" href="/supplies/tester" />
        <Tile theme={theme} icon={ShieldCheck} label="Input authenticity" hint="Public verification page" href="/input-authenticity" />
        <Tile theme={theme} icon={ClipboardCheck} label="Compliance checklist" hint={`${compliant} of ${licences.length} done`} onClick={() => setTab('compliance')} />
      </div>

      {tab === 'inventory' && (
        <div className="space-y-6">
          {unregistered.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {unregistered.length} batch code(s) are not in the authenticity registry yet, so farmers scanning them see “unverified”.
              </p>
              <Btn theme={theme} size="sm" icon={ShieldCheck} onClick={registerAll}>Register all</Btn>
            </div>
          )}
          <Panel theme={theme} title="Batch-coded inventory" icon={FlaskConical} action={<Btn theme={theme} size="sm" icon={PlusCircle} onClick={() => setAddOpen(true)}>Add batch</Btn>}>
            {batches.length === 0 ? (
              <EmptyState theme={theme} icon={FlaskConical} title="No batches" text="Add a batch or upload a manifest CSV." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-500">
                    <tr><th className="py-2">Product</th><th>Batch</th><th>Expiry</th><th>Stock</th><th>Registry</th><th className="sr-only">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/5">
                    {batches.map((b) => {
                      const days = daysUntil(b.expiry);
                      return (
                        <tr key={b.id}>
                          <td className="py-3 font-semibold text-slate-900">{b.name}</td>
                          <td className="font-mono text-xs text-slate-700">{b.batch}</td>
                          <td>
                            <span className={days <= 60 ? 'font-semibold text-red-700' : 'text-slate-700'}>{b.expiry}</span>
                            {days <= 60 && <span className="block text-xs text-red-600">{days < 0 ? 'Expired' : `${days} days left`}</span>}
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <button type="button" aria-label={`Reduce ${b.name} stock`} className="rounded-lg p-1 text-slate-600 hover:bg-rose-50" onClick={() => setBatches((all) => all.map((x) => (x.id === b.id ? { ...x, stock: Math.max(0, x.stock - 1) } : x)))}>
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="w-10 text-center tabular-nums">{b.stock}</span>
                              <button type="button" aria-label={`Increase ${b.name} stock`} className="rounded-lg p-1 text-slate-600 hover:bg-rose-50" onClick={() => setBatches((all) => all.map((x) => (x.id === b.id ? { ...x, stock: x.stock + 1 } : x)))}>
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                          <td>
                            {b.registered ? (
                              <Badge tone="green">Registered</Badge>
                            ) : (
                              <Btn theme={theme} size="sm" variant="soft" onClick={() => { setBatches((all) => all.map((x) => (x.id === b.id ? { ...x, registered: true } : x))); toast.success(`${b.batch} registered`); }}>
                                Register
                              </Btn>
                            )}
                          </td>
                          <td className="text-right">
                            <Btn theme={theme} size="sm" variant="danger" icon={Trash2} aria-label={`Remove ${b.name}`} onClick={() => { setBatches((all) => all.filter((x) => x.id !== b.id)); toast.success('Batch removed'); }}>
                              Remove
                            </Btn>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">Manifest format: CSV with columns <code>name,batch,expiry,stock</code> (expiry as YYYY-MM-DD).</p>
          </Panel>
        </div>
      )}

      {tab === 'compliance' && (
        <Panel theme={theme} title="Licences & registrations" icon={ClipboardCheck}>
          <ul className="divide-y divide-slate-900/5">
            {licences.map((l) => (
              <li key={l.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  {l.verified ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" aria-hidden />}
                  <div>
                    <p className="font-semibold text-slate-900">{l.name}</p>
                    <p className="text-sm text-slate-500">{l.file ? `On file: ${l.file}` : 'Not uploaded'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn theme={theme} size="sm" variant={l.verified ? 'ghost' : 'solid'} icon={FileUp} onClick={() => { setLicenceTarget(l.id); licenceInput.current?.click(); }}>
                    {l.file ? 'Replace' : 'Upload'}
                  </Btn>
                  {l.file && (
                    <Btn theme={theme} size="sm" variant="danger" onClick={() => setLicences((all) => all.map((x) => (x.id === l.id ? { ...x, file: undefined, verified: false } : x)))}>
                      Remove
                    </Btn>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === 'payouts' && <PayoutPanel theme={theme} storageKey="kr_dealer_payout" />}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a batch"
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn>
            <Btn theme={theme} icon={PlusCircle} onClick={addBatch}>Add batch</Btn>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Product">
              <input className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Captan 50% WP (500 g)" />
            </Field>
          </div>
          <Field label="Batch code">
            <input className={`${INPUT} uppercase`} value={draft.batch} onChange={(e) => setDraft({ ...draft, batch: e.target.value })} placeholder="e.g. CP-25-0091" />
          </Field>
          <Field label="Expiry">
            <input type="date" className={INPUT} value={draft.expiry} onChange={(e) => setDraft({ ...draft, expiry: e.target.value })} />
          </Field>
          <Field label="Stock (units)">
            <input type="number" min={0} className={INPUT} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </PortalShell>
  );
}
