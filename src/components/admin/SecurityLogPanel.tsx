'use client';

/**
 * Admin → Security → Security log: the latest entries from security_log
 * (written by the database itself — admin codes, wrong codes, Admin opened
 * or locked, admin sign-ins, roles given or removed, rule changes,
 * payments). Read-only; nobody can edit or delete entries from the website.
 */
import { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';

import { Btn, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { supabase } from '@/lib/db/client';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

interface Entry {
  id: number;
  at: string;
  email: string | null;
  event: string;
  detail: string | null;
}

const WARN = /Wrong admin code|blocked|Role removed|secret changed/i;

export function SecurityLogPanel() {
  const [rows, setRows] = useState<Entry[] | null | undefined>(undefined);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('security_log').select('id, at, email, event, detail').order('at', { ascending: false }).limit(100);
    setRows(error ? null : ((data ?? []) as Entry[]));
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
    <Panel theme={theme} title="Security log" icon={History} className="lg:col-span-2" action={<Btn theme={theme} size="sm" variant="soft" icon={RefreshCw} onClick={() => void load()}>Refresh</Btn>}>
      {rows === undefined ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : rows === null ? (
        <p className="text-sm text-amber-900">Run the security log SQL file (20261017000000_security_log.sql) in Supabase first.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing recorded yet.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">Latest 100 events. Red ones are worth a look — e.g. wrong admin codes you did not type, or an admin sign-in you did not make. If you see one, change your password and admin code.</p>
          <ol className="max-h-[28rem] divide-y divide-slate-200 overflow-y-auto rounded-xl text-sm ring-1 ring-slate-200">
            {rows.map((r) => (
              <li key={r.id} className={`grid gap-1 px-3 py-2 sm:grid-cols-[11rem_1fr] ${WARN.test(r.event) ? 'bg-rose-50' : ''}`}>
                <time dateTime={r.at} className="text-xs tabular-nums text-slate-500">{new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' })}</time>
                <span className="min-w-0">
                  <span className={`font-semibold ${WARN.test(r.event) ? 'text-rose-800' : 'text-slate-900'}`}>{r.event}</span>
                  {r.detail && <span className="text-slate-600"> — {r.detail}</span>}
                  {r.email && <span className="block truncate text-xs text-slate-500">{r.email}</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}
