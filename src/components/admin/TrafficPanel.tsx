'use client';

/**
 * Admin → Security → Sign-ins and traffic: what the server saw in the last
 * day (security_events, lib/server/securityLog) — sign-ins right and wrong,
 * sign-ups, reset emails, requests refused for going too fast, failed bot
 * checks, refused data requests and server errors — with, for each kind, how
 * many networks it came from and the busiest one (a hash, never an address).
 * Many wrong passwords or refusals from one network is a guessing attack or a
 * bot. Read-only.
 */
import { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';

import { RefreshBtn } from '@/components/admin/RefreshBtn';
import { Badge, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { supabase } from '@/lib/db/client';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

const KIND: Record<string, { label: string; warn?: boolean }> = {
  signin_ok: { label: 'Sign-ins' },
  signin_fail: { label: 'Wrong passwords', warn: true },
  signin_paused: { label: 'Sign-in paused (too many wrong)', warn: true },
  signup: { label: 'New accounts' },
  signup_paused: { label: 'Sign-ups paused (one network)', warn: true },
  reset_email: { label: 'Password-reset emails' },
  email_paused: { label: 'Email / code floods paused', warn: true },
  rate_limited: { label: 'Requests refused: too fast', warn: true },
  bot_check_failed: { label: 'Failed the “I am human” check', warn: true },
  forbidden: { label: 'Data requests refused (no permission)', warn: true },
  api_error: { label: 'Server errors', warn: true },
};

interface Row {
  kind: string;
  events: number;
  networks: number;
  top_network: string | null;
  top_count: number | null;
}
interface Event {
  id: number;
  at: string;
  kind: string;
  ip_hash: string | null;
  path: string | null;
  status: number | null;
  detail: string | null;
}

export function TrafficPanel() {
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined);
  const [recent, setRecent] = useState<Event[]>([]);

  const load = useCallback(async () => {
    const [sum, ev] = await Promise.all([
      supabase.rpc('kr_security_summary', { p_hours: 24 }),
      supabase.from('security_events').select('id, at, kind, ip_hash, path, status, detail').neq('kind', 'signin_ok').order('at', { ascending: false }).limit(40),
    ]);
    setRows(sum.error ? null : ((sum.data ?? []) as Row[]));
    setRecent(ev.error ? [] : ((ev.data ?? []) as Event[]));
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

  return (
    <Panel theme={theme} title="Sign-ins and traffic (last 24 hours)" icon={Activity} className="lg:col-span-2" action={<RefreshBtn onRefresh={load} />}>
      {rows === undefined ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : rows === null ? (
        <p className="text-sm text-amber-900">Not available yet: run supabase/RUN_THIS_ONCE.sql (Setup check, “Security hardening”), and set KYC_DB_SECRET in Vercel so the server can write the log.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing recorded in the last 24 hours.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">What</th>
                <th className="py-2 pr-3">How many</th>
                <th className="py-2 pr-3">Networks</th>
                <th className="py-2">Busiest network</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const k = KIND[r.kind] ?? { label: r.kind };
                // One network behind most of a warning kind: worth a look.
                const focused = k.warn && r.top_count !== null && r.events >= 10 && r.top_count / r.events >= 0.5;
                return (
                  <tr key={r.kind} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-900">
                      {k.label} {focused && <Badge tone="red">one network</Badge>}
                    </td>
                    <td className="py-2 pr-3">{r.events.toLocaleString('en-IN')}</td>
                    <td className="py-2 pr-3">{r.networks.toLocaleString('en-IN')}</td>
                    <td className="py-2 font-mono text-xs text-slate-600">{r.top_network ? `${r.top_network.slice(0, 10)}… (${r.top_count})` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {recent.length > 0 && (
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-800">Latest events (not counting good sign-ins)</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {recent.map((e) => (
              <li key={e.id} className="rounded-lg bg-slate-50 px-2 py-1.5">
                <span className="font-semibold">{KIND[e.kind]?.label ?? e.kind}</span> · {new Date(e.at).toLocaleString('en-IN')} · {e.path ?? ''} {e.status ? `· ${e.status}` : ''} {e.detail ? `· ${e.detail}` : ''}{' '}
                <span className="font-mono text-slate-500">{e.ip_hash ? `net ${e.ip_hash.slice(0, 8)}` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}
