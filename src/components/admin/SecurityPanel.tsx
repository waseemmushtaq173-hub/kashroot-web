'use client';

/**
 * Admin → Security: the admin team (who else can open Admin), the admin code
 * (change it, lock now), the identity-check rules for money actions (Aadhaar,
 * PAN) and whether the server can record checks, and a short list of
 * protections that are on.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, IdCard, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { AdminTeamPanel } from '@/components/admin/AdminTeamPanel';
import { Btn, Field, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { kycRules, lockAdminNow, setAdminCode, setKycRules, type KycRules } from '@/lib/db/security';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

export function SecurityPanel() {
  const [rules, setRules] = useState<KycRules | null | undefined>(undefined);
  const [panOnline, setPanOnline] = useState<boolean | null>(null);
  const [form, setForm] = useState({ old: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRules(await kycRules());
    const cfg = (await fetch('/api/kyc/config').then((r) => r.json()).catch(() => null)) as { online?: boolean } | null;
    setPanOnline(cfg?.online ?? false);
  }, []);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  const changeCode = async () => {
    if (form.next.length < 6) return toast.error('Use at least 6 letters or numbers.');
    if (form.next !== form.again) return toast.error('The two new codes are different.');
    setBusy(true);
    try {
      await setAdminCode(form.next, form.old);
      setForm({ old: '', next: '', again: '' });
      toast.success('Admin code changed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the code.');
    } finally {
      setBusy(false);
    }
  };

  const saveRules = async (required: boolean, pan: boolean) => {
    setBusy(true);
    try {
      await setKycRules(required, pan);
      toast.success(required ? 'Identity check is now required for money actions' : 'Identity check is now optional');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AdminTeamPanel />
      <Panel theme={theme} title="Identity checks (KYC) before money" icon={IdCard} className="lg:col-span-2">
        {rules === undefined ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : rules === null ? (
          <p className="text-sm text-amber-900">Run the security SQL file (20261014000000_trust_and_security.sql) in Supabase first.</p>
        ) : (
          <div className="space-y-4 text-sm text-slate-700">
            <p>When this is on, people must verify their <strong>Aadhaar</strong> (free, with UIDAI’s signed QR / offline file) before they sell, order, book cold storage, list a store or add UPI / bank details. The database itself refuses those actions otherwise.</p>
            <p className={`flex items-start gap-2 rounded-xl p-3 ring-1 ${rules.recording ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-amber-50 text-amber-900 ring-amber-200'}`}>
              {rules.recording ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              {rules.recording ? (
                <span>KashRoot can record verified checks. (Also make sure <code>KYC_DB_SECRET</code> is set in Vercel — if it is missing, checks succeed but are not saved.)</span>
              ) : (
                <span>Not set up yet. In Supabase → SQL Editor run <code>select public.kr_kyc_secret();</code>, copy the long text it shows, add it in Vercel → Settings → Environment Variables as <code>KYC_DB_SECRET</code>, and redeploy. Then switch this on.</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn theme={theme} variant={rules.kyc_required ? 'solid' : 'soft'} icon={ShieldCheck} disabled={busy} aria-pressed={rules.kyc_required} onClick={() => void saveRules(!rules.kyc_required, rules.pan_required && !rules.kyc_required)}>
                {rules.kyc_required ? 'Aadhaar required — on' : 'Require Aadhaar'}
              </Btn>
              <Btn theme={theme} variant={rules.pan_required ? 'solid' : 'soft'} icon={IdCard} disabled={busy || !rules.kyc_required || panOnline === false} aria-pressed={rules.pan_required} onClick={() => void saveRules(rules.kyc_required, !rules.pan_required)}>
                {rules.pan_required ? 'PAN required too — on' : 'Also require PAN'}
              </Btn>
            </div>
            {panOnline === false && <p className="text-xs text-slate-500">PAN can be checked only with the Income Tax database through a KYC provider (Sandbox: SANDBOX_API_KEY and SANDBOX_API_SECRET in Vercel, paid per check). Until then PAN cannot be required — nobody could pass.</p>}
          </div>
        )}
      </Panel>

      <Panel theme={theme} title="Change admin code" icon={KeyRound}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void changeCode(); }}>
          <Field label="Current code"><input type="password" autoComplete="current-password" className={INPUT} value={form.old} onChange={(e) => setForm({ ...form, old: e.target.value })} /></Field>
          <Field label="New code"><input type="password" autoComplete="new-password" className={INPUT} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></Field>
          <Field label="New code again"><input type="password" autoComplete="new-password" className={INPUT} value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} /></Field>
          <Btn theme={theme} type="submit" icon={KeyRound} disabled={busy}>Change code</Btn>
        </form>
      </Panel>

      <Panel theme={theme} title="Protections" icon={LockKeyhole}>
        <ul className="space-y-2 text-sm text-slate-700">
          {[
            'Admin portal unlisted, and locked with your code (5 wrong tries → blocked 15 minutes)',
            'Every table protected by row-level security in the database',
            'Identity checks recorded only by the KashRoot server',
            'Browser security headers: no framing, no sniffing, strict HTTPS, limited permissions',
            'Sign-in, OTP, KYC and AI requests are rate-limited',
          ].map((t) => (
            <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {t}</li>
          ))}
        </ul>
        <Btn theme={theme} variant="danger" className="mt-4" icon={LockKeyhole} onClick={() => void lockAdminNow().then(() => window.location.reload())}>Lock Admin portal now</Btn>
      </Panel>
    </div>
  );
}
