'use client';

/**
 * Admin → Security → Admin team. The owner gives Admin access to a partner by
 * the email of their KashRoot account, and can take it away. The staff QR
 * opens the Admin sign-in; each admin then makes their own admin code.
 * Partners see the team but cannot change it (the database enforces this).
 */
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Crown, QrCode, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Badge, Btn, Field, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { addAdmin, adminTeam, removeAdmin, type AdminMember } from '@/lib/db/security';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

function StaffQr() {
  const [src, setSrc] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    const link = `${window.location.origin}/login/admin`;
    QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 320, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((data) => {
        if (!live) return;
        setUrl(link);
        setSrc(data);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!src) return null;
  return (
    <figure className="inline-flex flex-col items-center rounded-2xl bg-white p-3 ring-1 ring-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <img src={src} width={160} height={160} alt="Staff QR code: opens the KashRoot Admin sign-in" />
      <figcaption className="mt-2 max-w-[13rem] text-center text-xs text-slate-600">
        Staff QR — opens <span className="font-semibold">{url.replace(/^https?:\/\//, '')}</span>. Show it only to your admins.
      </figcaption>
    </figure>
  );
}

export function AdminTeamPanel() {
  const [team, setTeam] = useState<AdminMember[] | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setTeam(await adminTeam()), []);
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

  const iAmOwner = Boolean(team?.find((m) => m.is_me)?.is_owner);

  const add = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error('Enter the email of their KashRoot account.');
    setBusy(true);
    try {
      await addAdmin(email.trim());
      toast.success(`${email.trim()} can now open the Admin portal. They will make their own admin code.`);
      setEmail('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add this admin.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: AdminMember) => {
    if (!window.confirm(`Remove Admin access from ${m.full_name || m.email}?`)) return;
    setBusy(true);
    try {
      await removeAdmin(m.user_id);
      toast.success('Admin access removed');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove this admin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel theme={theme} title="Admin team" icon={Users} className="lg:col-span-2">
      {team === undefined ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : team === null ? (
        <p className="text-sm text-amber-900">Run the admin team SQL file (20261015000000_admin_team.sql) in Supabase first.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[1fr_auto]">
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              The Admin portal is hidden from everyone else. To give a partner access: they create a KashRoot account (any portal), you add their email here, then they scan the staff QR, sign in and make their <strong>own</strong> admin code. Only you, the owner, can add or remove admins.
            </p>
            {iAmOwner && (
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
                <div className="min-w-[14rem] flex-1">
                  <Field label="Partner’s account email">
                    <input type="email" autoComplete="off" className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                  </Field>
                </div>
                <Btn theme={theme} type="submit" icon={UserPlus} disabled={busy || !email.trim()}>Give Admin access</Btn>
              </form>
            )}
            <ul className="divide-y divide-slate-200 rounded-xl ring-1 ring-slate-200">
              {team.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{m.full_name || m.email.split('@')[0]}{m.is_me && ' (you)'}</span>
                    <span className="block truncate text-xs text-slate-500">{m.email}</span>
                  </span>
                  {m.is_owner ? <Badge tone="violet"><Crown className="mr-1 inline h-3 w-3" aria-hidden />Owner</Badge> : <Badge tone="blue">Partner</Badge>}
                  {m.has_code ? <Badge tone="green">Code set</Badge> : <Badge tone="amber">No code yet</Badge>}
                  {iAmOwner && !m.is_me && !m.is_owner && (
                    <Btn theme={theme} size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={() => void remove(m)}>Remove</Btn>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><QrCode className="h-4 w-4" aria-hidden /> For admins only</p>
            <StaffQr />
          </div>
        </div>
      )}
    </Panel>
  );
}
