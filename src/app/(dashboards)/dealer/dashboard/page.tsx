'use client';

/**
 * Agro-dealer portal — batch-coded inventory, licence compliance, batch
 * manifest upload to the authenticity registry, and payouts.
 *
 * Stock and licence files are kept on this device (kr_dealer_*); registering
 * a batch writes it to the shared registry farmers check (fertilizer_batches),
 * with the dealer's name and district. Dealers can ask KashRoot to verify
 * them (Compliance tab); payout details live in payout_accounts. The manifest
 * is read locally (CSV: name,batch,expiry,stock[,manufacturer,type,registration]).
 */
import { useEffect, useRef, useState } from 'react';
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
import { PayoutForm } from '@/components/payments/PayoutForm';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel, Tile } from '@/components/portal/kit';
import { myRoleRequest, requestStaffRole } from '@/lib/db/advisory';
import { dbMessage, loadAccount, type Account } from '@/lib/db/client';
import { myPayout, type PayoutAccount } from '@/lib/db/rentals';
import { localId, usePersistentState } from '@/lib/portal-store';
import { supabase, supabaseConfigured } from '@/lib/supabase';

const theme = PORTAL_THEMES.dealer;

interface Batch {
  id: string;
  name: string;
  batch: string;
  expiry: string;
  stock: number;
  /** Optional; defaults to "Not specified" in the registry. */
  manufacturer?: string;
  type?: ProductType;
  /** CIB&RC registration (pesticides) or FCO / licence number. */
  registration?: string;
  registered: boolean;
}

type ProductType = 'fertilizer' | 'pesticide' | 'seed' | 'other';
const TYPES: { id: ProductType; label: string }[] = [
  { id: 'fertilizer', label: 'Fertiliser' },
  { id: 'pesticide', label: 'Pesticide / fungicide' },
  { id: 'seed', label: 'Seed / sapling' },
  { id: 'other', label: 'Other' },
];

interface Licence {
  id: string;
  name: string;
  file?: string;
  verified: boolean;
}

const NO_BATCHES: Batch[] = [];

const LICENCES: Licence[] = [
  { id: 'L-1', name: 'Insecticide selling licence', verified: false },
  { id: 'L-2', name: 'Fertiliser dealer registration', verified: false },
  { id: 'L-3', name: 'Seed dealer licence', verified: false },
  { id: 'L-4', name: 'GST registration certificate', verified: false },
];

const daysUntil = (date: string) => Math.ceil((Date.parse(date) - Date.now()) / 86_400_000);

const EMPTY_BATCH = { name: '', batch: '', expiry: '', stock: '', manufacturer: '', type: 'fertilizer' as ProductType, registration: '' };

export default function DealerDashboardPage() {
  const [tab, setTab] = useState('inventory');
  const [batches, setBatches] = usePersistentState<Batch[]>('kr_dealer_batches_v2', NO_BATCHES);
  const [licences, setLicences] = usePersistentState<Licence[]>('kr_dealer_licences_v2', LICENCES);
  const [account, setAccount] = useState<Account | null>(null);
  const [payout, setPayout] = useState<PayoutAccount | null | undefined>(undefined);
  useEffect(() => {
    void loadAccount().then((a) => {
      setAccount(a);
      if (a) void myPayout(a.id).then(setPayout).catch(() => setPayout(null));
    });
  }, []);
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
    setBatches((all) => [{ id: localId('B'), name: draft.name.trim(), batch: draft.batch.trim().toUpperCase(), expiry: draft.expiry, stock, manufacturer: draft.manufacturer.trim() || undefined, type: draft.type, registration: draft.registration.trim() || undefined, registered: false }, ...all]);
    setDraft(EMPTY_BATCH);
    setAddOpen(false);
    toast.success('Batch added — register it so farmers can verify it');
  };

  /** Writes batches to the shared registry farmers verify against, with this dealer's name. */
  const pushToRegistry = async (list: Batch[]): Promise<boolean> => {
    if (!supabaseConfigured) {
      toast.error('The batch registry is not connected on this site yet.');
      return false;
    }
    if (!account) {
      toast.error('Please sign in again to register batches.');
      return false;
    }
    const { error } = await supabase.from('fertilizer_batches').upsert(
      list.map((b) => ({
        batch_code: b.batch,
        product: b.name,
        manufacturer: b.manufacturer || 'Not specified',
        expiry_date: b.expiry || null,
        product_type: b.type ?? 'fertilizer',
        registration_no: b.registration ?? null,
        dealer_name: account.business || account.name,
        dealer_licence: account.licence || null,
        dealer_district: account.district || null,
      })),
      { onConflict: 'batch_code' },
    );
    if (error) {
      const taken = /row-level security/i.test(error.message);
      toast.error(taken ? 'One of these batch codes is already registered by another dealer. Check the code on the pack.' : dbMessage(error, 'Could not register the batches.'));
      return false;
    }
    const codes = new Set(list.map((b) => b.batch));
    setBatches((all) => all.map((b) => (codes.has(b.batch) ? { ...b, registered: true } : b)));
    return true;
  };

  const registerAll = async () => {
    if (unregistered.length === 0) return toast.info('Every batch is already registered.');
    if (await pushToRegistry(unregistered)) toast.success(`${unregistered.length} batch code(s) registered — farmers can now verify them`);
  };

  const readManifest = async (file: File) => {
    const rows = (await file.text())
      .split(/\r?\n/)
      .map((line) => line.split(',').map((c) => c.trim()))
      .filter((c) => c.length >= 4 && c[0] && !/^name$/i.test(c[0]));
    const parsed: Batch[] = rows
      .filter(([, batch, expiry, stock]) => batch && !Number.isNaN(Date.parse(expiry)) && Number(stock) >= 0)
      .map(([name, batch, expiry, stock, manufacturer, type, registration]) => ({
        id: localId('B'),
        name,
        batch: batch.toUpperCase(),
        expiry,
        stock: Number(stock),
        manufacturer: manufacturer || undefined,
        type: TYPES.some((t) => t.id === type?.toLowerCase()) ? (type.toLowerCase() as ProductType) : 'fertilizer',
        registration: registration || undefined,
        registered: false,
      }));
    if (parsed.length === 0) return toast.error('No valid rows. Use CSV columns: name,batch,expiry (YYYY-MM-DD),stock');
    setBatches((all) => [...parsed, ...all.filter((b) => !parsed.some((p) => p.batch === b.batch))]);
    toast.success(`${parsed.length} batch(es) imported from ${file.name}`);
    if (await pushToRegistry(parsed)) toast.success('Imported batches registered');
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
        <Tile theme={theme} icon={ShieldCheck} label="Price Comparison" hint="List inputs where buyers compare" href="/compare-prices" />
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
              <div className="relative overflow-x-auto">
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
                              <Btn theme={theme} size="sm" variant="soft" onClick={async () => { if (await pushToRegistry([b])) toast.success(`${b.batch} registered`); }}>
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
            <p className="mt-4 text-xs text-slate-500">Manifest format: CSV with columns <code>name,batch,expiry,stock,manufacturer,type,registration</code> (expiry as YYYY-MM-DD; type is fertilizer, pesticide, seed or other).</p>
          </Panel>
        </div>
      )}

      {tab === 'compliance' && account && <DealerVerification account={account} />}

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

      {tab === 'payouts' && <div className="max-w-xl"><PayoutForm theme={theme} payout={payout} onSaved={setPayout} intro="Buyers who order from you in Price Comparison pay here after delivery. Only someone with a live order sees these." /></div>}

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
          <Field label="Type">
            <select className={INPUT} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ProductType })}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <Field label={draft.type === 'pesticide' ? 'CIB&RC registration no.' : 'Registration / FCO no. (optional)'}>
            <input className={INPUT} value={draft.registration} onChange={(e) => setDraft({ ...draft, registration: e.target.value })} placeholder="As printed on the pack" />
          </Field>
          <Field label="Batch code">
            <input className={`${INPUT} uppercase`} value={draft.batch} onChange={(e) => setDraft({ ...draft, batch: e.target.value })} placeholder="e.g. CP-25-0091" />
          </Field>
          <Field label="Expiry">
            <input type="date" className={INPUT} value={draft.expiry} onChange={(e) => setDraft({ ...draft, expiry: e.target.value })} />
          </Field>
          <Field label="Stock (units)">
            <input type="number" min={0} className={INPUT} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Manufacturer">
              <input className={INPUT} value={draft.manufacturer} onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} placeholder="As printed on the pack" />
            </Field>
          </div>
        </div>
      </Modal>
    </PortalShell>
  );
}

/** Ask KashRoot to verify this dealer; farmers then see “verified dealer” on its batches. */
function DealerVerification({ account }: { account: Account }) {
  const verified = account.staff.includes('DEALER') || account.staff.includes('ADMIN');
  const [status, setStatus] = useState<string | null | undefined>(undefined);
  const [form, setForm] = useState({ shop: account.business, licence: account.licence, phone: account.phone });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (verified) return;
    void myRoleRequest('DEALER', account.id).then((r) => setStatus(r?.status ?? null)).catch(() => setStatus(null));
  }, [account.id, verified]);

  const apply = async () => {
    if (form.licence.trim().length < 4) return toast.error('Enter your fertiliser or pesticide licence number.');
    setBusy(true);
    try {
      await requestStaffRole('DEALER', { name: form.shop.trim() || account.name, phone: form.phone, email: account.email, details: `Licence: ${form.licence.trim()}${account.district ? ` · ${account.district}` : ''}` });
      setStatus('pending');
      toast.success('Sent — the KashRoot admin will check your licence');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel theme={theme} title="KashRoot verified dealer" icon={ShieldCheck} className="mb-6">
      {verified ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" aria-hidden /> You are verified. Farmers checking your batches see “KashRoot-verified dealer”.</p>
      ) : status === 'pending' ? (
        <p className="text-sm text-slate-700">Your request is with the KashRoot admin. Until then farmers see your batches as registered by a dealer not yet verified.</p>
      ) : status === undefined ? null : (
        <form className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
          <Field label="Shop name">
            <input className={INPUT} value={form.shop} onChange={(e) => setForm({ ...form, shop: e.target.value })} />
          </Field>
          <Field label="Licence number">
            <input className={INPUT} value={form.licence} onChange={(e) => setForm({ ...form, licence: e.target.value })} placeholder="Fertiliser / insecticide licence" />
          </Field>
          <Field label="Mobile">
            <input className={INPUT} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Btn theme={theme} type="submit" icon={ShieldCheck} disabled={busy}>Get verified</Btn>
          {status === 'rejected' && <p className="text-sm text-rose-700 sm:col-span-4">Your last request was not approved. Check the licence number and try again.</p>}
        </form>
      )}
    </Panel>
  );
}
