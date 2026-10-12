'use client';

/**
 * The Admin portal's lock. Signing in is not enough: the admin also enters
 * their own access code each time (it stays open 12 hours on that device).
 * The first time, the admin chooses the code. The database itself refuses
 * admin actions until the code is entered, so this screen is not the only
 * protection. It fails closed: if the lock is not set up in the database,
 * or the check cannot be made, the console stays hidden.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyRound, Loader2, LockKeyhole, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Btn, Field, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { adminStatus, lockAdminNow, setAdminCode, unlockAdmin, type AdminCheck } from '@/lib/db/security';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

/** Admin locks itself after this long without a click, key press or touch. */
const IDLE_MS = 15 * 60_000;

/** While the console is open: lock it (in the database too) after 15 idle minutes. */
function useIdleLock(active: boolean, onLock: () => void) {
  const last = useRef(0);
  useEffect(() => {
    if (!active) return;
    last.current = Date.now();
    const touch = () => {
      last.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const id = window.setInterval(() => {
      if (Date.now() - last.current > IDLE_MS) {
        window.clearInterval(id);
        void lockAdminNow().finally(onLock);
      }
    }, 30_000);
    return () => {
      window.clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [active, onLock]);
}

export function AdminLock({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminCheck | undefined>(undefined);
  const [code, setCode] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const check = useCallback(async () => setStatus(await adminStatus()), []);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await check();
    };
    void run();
    return () => {
      live = false;
    };
  }, [check]);

  const idleLocked = useCallback(() => {
    setMessage('Locked after 15 minutes without use. Enter your admin code to continue.');
    setStatus('locked');
  }, []);
  useIdleLock(status === 'unlocked', idleLocked);

  if (status === 'unlocked') return <>{children}</>;

  const create = async () => {
    if (code.length < 6) return setMessage('Use at least 6 letters or numbers.');
    if (code !== again) return setMessage('The two codes are different.');
    setBusy(true);
    try {
      await setAdminCode(code);
      toast.success('Admin code saved. Keep it secret — you will need it every time.');
      setCode('');
      setAgain('');
      await check();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save the code.');
    } finally {
      setBusy(false);
    }
  };

  const open = async () => {
    setBusy(true);
    try {
      const result = await unlockAdmin(code);
      setCode('');
      if (result === 'wrong') setMessage('That code is not right. After 5 wrong tries the Admin portal is blocked for 15 minutes.');
      else if (result === 'blocked') setMessage('Too many wrong codes. Try again in 15 minutes.');
      await check();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not check the code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalShell title="Admin portal" description="Restricted. Enter your admin access code to continue." eyebrow="Locked" theme="admin">
      <div className="mx-auto max-w-md">
        <Panel theme={theme} title={status === 'no_code' ? 'Create your admin code' : 'Enter your admin code'} icon={status === 'no_code' ? KeyRound : LockKeyhole}>
          {status === undefined ? (
            <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking…</p>
          ) : status === 'not_admin' ? (
            <p className="flex items-start gap-2 text-sm text-slate-700"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden /> This account is not a KashRoot admin.</p>
          ) : status === 'missing' ? (
            <div className="space-y-3 text-sm text-slate-700">
              <p className="flex items-start gap-2 font-semibold text-rose-800"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> The admin lock is not switched on in the database yet, so the Admin portal stays closed.</p>
              <p>In Supabase → SQL Editor, run the file <code>20261014000000_trust_and_security.sql</code> (then <code>20261015000000_admin_team.sql</code> and <code>20261016000000_admin_accounts.sql</code>). Then press Check again and create your admin code.</p>
              <Btn theme={theme} variant="soft" icon={RefreshCw} onClick={() => { setStatus(undefined); void check(); }}>Check again</Btn>
            </div>
          ) : status === 'offline' ? (
            <div className="space-y-3 text-sm text-slate-700">
              <p className="flex items-start gap-2 text-rose-800"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Could not check the admin lock — the portal stays closed. Check your internet and try again.</p>
              <Btn theme={theme} variant="soft" icon={RefreshCw} onClick={() => { setStatus(undefined); void check(); }}>Try again</Btn>
            </div>
          ) : status === 'blocked' ? (
            <p className="flex items-start gap-2 text-sm text-rose-800"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Too many wrong codes. The Admin portal is blocked for 15 minutes.</p>
          ) : (
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); setMessage(null); void (status === 'no_code' ? create() : open()); }}>
              {status === 'no_code' && (
                <p className="text-sm text-slate-700">Choose a code only you know (6–32 letters, numbers or symbols). After this, the Admin portal asks for it every time you sign in — even someone with your password cannot open it.</p>
              )}
              <Field label="Admin code">
                <input type="password" autoComplete={status === 'no_code' ? 'new-password' : 'current-password'} className={INPUT} value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
              {status === 'no_code' && (
                <Field label="Type it again">
                  <input type="password" autoComplete="new-password" className={INPUT} value={again} onChange={(e) => setAgain(e.target.value)} />
                </Field>
              )}
              {message && <p role="alert" className="text-sm text-rose-800">{message}</p>}
              <Btn theme={theme} type="submit" icon={status === 'no_code' ? KeyRound : LockKeyhole} disabled={busy || code.length < 6}>
                {busy ? 'Checking…' : status === 'no_code' ? 'Save code and open' : 'Open Admin portal'}
              </Btn>
              {status === 'locked' && <p className="text-xs text-slate-500">Forgot it? In Supabase → SQL Editor run: <code>select public.kr_admin_reset_code(&apos;your email&apos;);</code> and set a new one.</p>}
            </form>
          )}
        </Panel>
      </div>
    </PortalShell>
  );
}
