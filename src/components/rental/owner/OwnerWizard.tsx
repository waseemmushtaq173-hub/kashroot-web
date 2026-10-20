'use client';

/**
 * The owner wizard — how a cold store owner puts their store on KashRoot,
 * one big step at a time, each saved as they go:
 *   1 Your cold store    name, owner, manager, where it is
 *   2 The building       its size and the main door (drawn from above)
 *   3 Chambers           bins or crates, counts, floors, sizes, doors, rent
 *                        (drawn from above, from the side and in 3D)
 *   4 Payment details    bank account (typed twice) and / or UPI
 *   5 Check and publish  the store in words and in 3D, then Publish
 * Everything typed is kept on this phone until it is saved (nothing is lost
 * when the owner leaves a step half-done). The drawings and the 3D view come
 * from the very rows that are saved (lib/coldStore storeModel). A new store
 * stays hidden from farmers until it is published.
 */
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Rocket, X } from 'lucide-react';
import { asksToVerify, openIdentityCheck } from '@/lib/client/identityCheck';
import { toast } from '@/lib/client/toast';

import { Btn, Panel, PORTAL_THEMES } from '@/components/portal/kit';
import { ChambersStep } from '@/components/rental/owner/ChambersStep';
import { PayoutFields, payoutDraftOf, savePayoutDraft } from '@/components/rental/owner/PaymentStep';
import { ReviewStep } from '@/components/rental/owner/ReviewStep';
import { BuildingStep, StoreStep, type Kit } from '@/components/rental/owner/StoreSteps';
import { blankStore, draftFromSaved, payoutIssues, setField, storeModel, type Issue, type PayoutDraft, type StoreDraft } from '@/lib/coldStore';
import type { Account } from '@/lib/db/client';
import { deleteChamber, saveColdStore, type ColdChamber } from '@/lib/db/coldMap';
import { publishStore, saveStore, type PayoutAccount, type RentalListing } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
export type Step = 1 | 2 | 3 | 4 | 5;
const STEPS: { n: Step; title: string }[] = [
  { n: 1, title: 'Your cold store' },
  { n: 2, title: 'The building' },
  { n: 3, title: 'Chambers' },
  { n: 4, title: 'Payment details' },
  { n: 5, title: 'Check and publish' },
];

/** What is typed is kept on this device, per owner and store, until it is saved. */
const keyOf = (owner: string, listing: string | null) => `kr_cold_wizard:${owner}:${listing ?? 'new'}`;
function readLocal(key: string): StoreDraft | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as StoreDraft | null;
    return v && typeof v === 'object' && Array.isArray(v.chambers) && v.building && typeof v.building === 'object' ? v : null;
  } catch {
    return null;
  }
}
function writeLocal(key: string, d: StoreDraft | null) {
  try {
    if (d) localStorage.setItem(key, JSON.stringify(d));
    else localStorage.removeItem(key);
  } catch {
    /* private mode: the draft lives only on this page */
  }
}

/** The same store typed the same way (a chamber's key only tracks it while editing). */
const sameDraft = (a: StoreDraft, b: StoreDraft) => {
  const plain = (d: StoreDraft) => JSON.stringify({ ...d, chambers: d.chambers.map((c) => ({ ...c, key: '' })) });
  return plain(a) === plain(b);
};

/** Boxes whose problems show even before the owner leaves them. */
const PICKED = /(wall|storage|floors|state|district)$/;

export function OwnerWizard({
  account,
  listing,
  rows,
  payout,
  prefill,
  start,
  onClose,
  onChanged,
  onPayout,
}: {
  account: Account;
  /** The store being changed (null: a new one). */
  listing: RentalListing | null;
  /** Its saved chamber rows. */
  rows: ColdChamber[];
  payout: PayoutAccount | null | undefined;
  /** A store from the directory its owner is listing ("Your store? List it"). */
  prefill?: { title: string; district: string; address: string } | null;
  start?: Step;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onPayout: (p: PayoutAccount) => void;
}) {
  const [listingId, setListingId] = useState<string | null>(listing?.id ?? null);
  const [init] = useState(() => {
    const saved = listing ? draftFromSaved(listing, rows) : blankStore(account, prefill);
    const local = readLocal(keyOf(account.id, listing?.id ?? null));
    const differs = Boolean(local && !sameDraft(local, saved));
    // A directory store being listed starts from its details, not an older unsaved draft.
    return { saved, draft: local && !prefill ? local : saved, restored: differs && !prefill };
  });
  const [draft, setDraft] = useState<StoreDraft>(init.draft);
  const [restored, setRestored] = useState(init.restored);
  const [done, setDone] = useState(() => ({ building: Boolean(listing?.building), chambers: rows.length > 0, published: Boolean(listing?.active) }));
  const firstOpen = (): Step => (!listing ? 1 : !listing.building ? 2 : !rows.length ? 3 : !payout ? 4 : 5);
  const [step, setStep] = useState<Step>(start ?? firstOpen());
  const [tried, setTried] = useState<Set<number>>(new Set());
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [checkWarnings, setCheckWarnings] = useState(false);
  const [selected, setSelected] = useState<string | null>(init.draft.chambers[0]?.key ?? null);
  const [payDraft, setPayDraft] = useState<PayoutDraft>(() => payoutDraftOf(payout, listing?.owner_name ?? account.name));
  const [payFrom, setPayFrom] = useState(payout);
  if (payout !== payFrom) {
    setPayFrom(payout);
    setPayDraft(payoutDraftOf(payout, listing?.owner_name ?? account.name));
  }

  const model = useMemo(() => storeModel(draft), [draft]);
  // The drawings follow a moment behind the typing, so typing never waits for them.
  const shown = useDeferredValue(model);
  const older = rows.filter((r) => r.chamber_no === null);

  const update = useCallback(
    (fn: (d: StoreDraft) => StoreDraft) =>
      setDraft((d) => {
        const next = fn(d);
        writeLocal(keyOf(account.id, listingId), next);
        return next;
      }),
    [account.id, listingId],
  );
  const touch = useCallback((field: string) => setTouched((t) => (t.has(field) ? t : new Set(t).add(field))), []);
  const set = useCallback(
    (field: string, value: string) => {
      update((d) => setField(d, field, value));
      if (PICKED.test(field)) touch(field);
    },
    [update, touch],
  );
  const fix = useCallback(
    (field: string, value: string) => {
      update((d) => setField(d, field, value));
      touch(field);
    },
    [update, touch],
  );
  const issuesOf = useCallback(
    (field: string): Issue[] => model.issues.filter((i) => i.field === field && (tried.has(i.step) || touched.has(field) || field.endsWith('.fit') || field === 'chambers')),
    [model.issues, tried, touched],
  );
  const kit: Kit = { draft, model, shown, issuesOf, set, touch, fix, update };

  // Steps up to the first one not saved yet can be opened.
  const furthest: Step = !listingId ? 1 : !done.building ? 2 : !done.chambers ? 3 : !payout ? 4 : 5;
  const reachable = (n: Step) => n <= Math.max(step, furthest);
  const go = (n: Step) => {
    setStep(n);
    setCheckWarnings(false);
    window.requestAnimationFrame(() => document.getElementById('cold-wizard')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  const showFirst = (field: string) =>
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(field)}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
    });

  const warnings = model.issues.filter((i) => i.level === 'warn' && i.step === 3);

  const next = async () => {
    const errors = step === 4 ? payoutIssues(payDraft) : model.issues.filter((i) => i.step === step && i.level === 'error');
    if (errors.length) {
      setTried((t) => new Set(t).add(step));
      if (step === 3) {
        const key = errors[0].field.split('.')[0];
        if (draft.chambers.some((c) => c.key === key)) setSelected(key);
      }
      toast.error(`${errors.length === 1 ? 'One thing needs' : `${errors.length} things need`} fixing: ${errors[0].message}`);
      showFirst(step === 4 ? `payout.${errors[0].field}` : errors[0].field);
      return;
    }
    if (step === 3 && warnings.length && !checkWarnings) {
      setTried((t) => new Set(t).add(3));
      setCheckWarnings(true);
      window.requestAnimationFrame(() => document.getElementById('cold-wizard-check')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    setBusy(true);
    try {
      if (step === 1) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { building, ...store } = model.store;
        const saved = await saveStore(store, listingId ?? undefined);
        if (!listingId) {
          writeLocal(keyOf(account.id, null), null);
          writeLocal(keyOf(account.id, saved.id), draft);
          setListingId(saved.id);
        }
        toast.success(listingId ? 'Saved' : 'Saved — now the building');
      } else if (step === 2 && listingId) {
        await saveStore({ building: model.building }, listingId);
        setDone((d) => ({ ...d, building: true }));
        toast.success('Building saved — now the chambers');
      } else if (step === 3 && listingId) {
        await saveColdStore(listingId, model.rows);
        setDone((d) => ({ ...d, chambers: model.rows.length > 0 || older.length > 0 }));
        toast.success(`Chambers saved — ${model.rows.length} floor${model.rows.length === 1 ? '' : 's'} in all`);
      } else if (step === 4) {
        onPayout(await savePayoutDraft(payDraft));
        toast.success('Payment details saved');
      }
      // What was kept on the phone is saved now: the notice about it goes.
      setRestored(false);
      await onChanged();
      go((step + 1) as Step);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save. Please try again.';
      // Not verified yet: the identity check opens right here; what is typed stays.
      if (asksToVerify(message)) {
        openIdentityCheck();
        toast.error('Verify your identity first: the identity check is open now (about a minute). Then tap “Save and next” again.');
      } else toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    const missing: [boolean, string, Step][] = [
      [!listingId, 'Save your cold store’s details first (step 1).', 1],
      [!done.building, 'Save the building first (step 2).', 2],
      [!done.chambers, 'Save at least one chamber first (step 3).', 3],
      [!payout, 'Add where farmers pay you first (step 4).', 4],
    ];
    const first = missing.find(([m]) => m);
    if (first || !listingId) {
      toast.error(first?.[1] ?? 'Save your cold store’s details first (step 1).');
      go(first?.[2] ?? 1);
      return;
    }
    setBusy(true);
    try {
      await publishStore(listingId);
      writeLocal(keyOf(account.id, listingId), null);
      toast.success('Published — farmers can now see your cold store and book it');
      setDone((d) => ({ ...d, published: true }));
      await onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  const removeOlder = async (c: ColdChamber) => {
    if (!window.confirm(`Remove ${c.name}? Farmers will not see it any more.`)) return;
    try {
      await deleteChamber(c.id);
      toast.success(`${c.name} removed`);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove.');
    }
  };

  const title = listing ? `Change ${listing.title}` : 'Add your cold store';
  return (
    <Panel theme={theme} className="lg:col-span-2" id="cold-wizard">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-600">Step {step} of 5 · {STEPS[step - 1].title}</p>
          </div>
          <Btn theme={theme} variant="ghost" className="min-h-[44px]" icon={X} onClick={onClose}>Close</Btn>
        </div>

        <nav aria-label="Steps">
          <div className="h-2.5 overflow-hidden rounded-full bg-violet-100" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step} aria-label={`Step ${step} of 5`}>
            <div className="h-full rounded-full bg-violet-700 transition-all" style={{ width: `${(step / 5) * 100}%` }} />
          </div>
          <ol className="mt-3 grid grid-cols-5 gap-1 text-center">
            {STEPS.map(({ n, title: t }) => {
              const can = reachable(n);
              return (
                <li key={n}>
                  <button
                    type="button"
                    disabled={!can || busy}
                    aria-current={n === step ? 'step' : undefined}
                    onClick={() => go(n)}
                    className={`flex min-h-[44px] w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold leading-tight transition sm:text-xs ${n === step ? 'bg-violet-700 text-white' : can ? 'cursor-pointer text-violet-900 hover:bg-violet-50' : 'cursor-not-allowed text-slate-400'}`}
                  >
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${n === step ? 'bg-white text-violet-800' : n < step || (n === 5 && done.published) ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{n < step ? '✓' : n}</span>
                    <span className="hidden sm:block">{t}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {restored && (
          <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sky-50 p-3 text-sm text-sky-950 ring-1 ring-sky-200">
            We kept what you typed last time on this phone (not saved yet).
            <Btn
              theme={theme}
              size="sm"
              variant="soft"
              onClick={() => {
                setDraft(init.saved);
                writeLocal(keyOf(account.id, listingId), null);
                setRestored(false);
                setSelected(init.saved.chambers[0]?.key ?? null);
              }}
            >
              Use what is saved instead
            </Btn>
          </p>
        )}

        {step === 1 && <StoreStep kit={kit} />}
        {step === 2 && <BuildingStep kit={kit} />}
        {step === 3 && <ChambersStep kit={kit} listingId={listingId ?? 'new'} selected={selected} onSelect={setSelected} older={older} onRemoveOlder={(c) => void removeOlder(c)} />}
        {step === 4 && (
          <div className="max-w-2xl space-y-4">
            <p className="text-base text-slate-700">Where farmers pay you for their bins and crates. Some farmers do not use UPI, so give a bank account if you can.</p>
            <PayoutFields value={payDraft} onChange={setPayDraft} showAll={tried.has(4)} />
          </div>
        )}
        {step === 5 && listingId && <ReviewStep model={model} payout={payout} listingId={listingId} warnings={warnings} />}

        {checkWarnings && step === 3 && (
          <div id="cold-wizard-check" role="alert" className="space-y-3 rounded-2xl bg-amber-50 p-4 text-amber-950 ring-2 ring-amber-300">
            <p className="font-semibold">Please check {warnings.length === 1 ? 'this' : `these ${warnings.length} things`} before saving:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">{warnings.map((w) => <li key={w.message}>{w.message}</li>)}</ul>
            <div className="flex flex-wrap gap-2">
              <Btn theme={theme} variant="soft" className="min-h-[48px]" onClick={() => setCheckWarnings(false)}>Go back and check</Btn>
              <Btn theme={theme} className="min-h-[48px]" icon={CheckCircle2} disabled={busy} onClick={() => void next()}>It is right — save anyway</Btn>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/5 pt-5">
          {step > 1 ? (
            <Btn theme={theme} variant="ghost" className="min-h-[48px]" icon={ArrowLeft} disabled={busy} onClick={() => go((step - 1) as Step)}>Back</Btn>
          ) : (
            <span className="text-xs text-slate-500">What you type is kept on this phone until it is saved.</span>
          )}
          {step < 5 ? (
            <Btn theme={theme} className="min-h-[52px] px-6 text-base" disabled={busy} onClick={() => void next()}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
              {busy ? 'Saving…' : 'Save and next'}
              {!busy && <ArrowRight className="h-5 w-5" aria-hidden />}
            </Btn>
          ) : done.published ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-emerald-800">Your store is published. Your changes are saved.</p>
              <Btn theme={theme} className="min-h-[52px] px-6 text-base" icon={CheckCircle2} onClick={onClose}>Done</Btn>
            </div>
          ) : (
            <Btn theme={theme} className="min-h-[52px] px-6 text-base" icon={Rocket} disabled={busy} onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish — show my store to farmers'}</Btn>
          )}
        </div>
      </div>
    </Panel>
  );
}
