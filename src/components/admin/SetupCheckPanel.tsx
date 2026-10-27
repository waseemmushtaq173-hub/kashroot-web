'use client';

/**
 * Admin → Setup check: one row per database setup file (kr_setup_status),
 * "Done" or "Not run". When an owner or farmer sees "This part of KashRoot is
 * still being set up", this says which file is missing and how to run it.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, DatabaseZap, XCircle } from 'lucide-react';

import { RefreshBtn } from '@/components/admin/RefreshBtn';
import { PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { setupStatus, type SetupStep } from '@/lib/db/setup';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

const HOW_TO_RUN = 'In Supabase open SQL Editor → New query, paste the whole file supabase/RUN_THIS_ONCE.sql from the KashRoot code, and press Run. It is safe to run again: it only adds what is missing. Then press Refresh here.';

export function SetupCheckPanel() {
  const [steps, setSteps] = useState<SetupStep[] | 'not-installed' | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSteps(await setupStatus());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check the database setup.');
    }
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

  const missing = Array.isArray(steps) ? steps.filter((s) => !s.done) : [];

  return (
    <Panel theme={theme} title="Setup check" icon={DatabaseZap} className="lg:col-span-2" action={<RefreshBtn onRefresh={load} />}>
      {error ? (
        <p role="alert" className="text-sm text-rose-800">{error}</p>
      ) : steps === undefined ? (
        <p className="text-sm text-slate-600">Checking…</p>
      ) : steps === 'not-installed' ? (
        <div role="alert" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <p className="font-semibold">The database has not had the latest setup yet, so this check cannot run.</p>
          <p>{HOW_TO_RUN}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {missing.length ? (
            <div role="alert" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
              <p className="font-semibold">
                {missing.length === 1 ? '1 setup step has' : `${missing.length} setup steps have`} not been run: {missing.map((s) => s.part).join(', ')}.
              </p>
              <p>Until then people see “This part of KashRoot is still being set up” there. {HOW_TO_RUN}</p>
            </div>
          ) : (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
              Everything is set up. If the site still says a part is being set up, wait a minute (Supabase reloads its list of tables) and try again.
            </p>
          )}
          <ol className="divide-y divide-slate-200 rounded-xl text-sm ring-1 ring-slate-200">
            {steps.map((s) => (
              <li key={s.step} className={`grid grid-cols-[1.5rem_1fr] items-start gap-2 px-3 py-2 ${s.done ? '' : 'bg-amber-50'}`}>
                {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" aria-label="Done" /> : <XCircle className="mt-0.5 h-4 w-4 text-amber-700" aria-label="Not run" />}
                <span className="min-w-0">
                  <span className={`font-semibold ${s.done ? 'text-slate-900' : 'text-amber-900'}`}>{s.part}</span>
                  <span className="text-slate-600"> — {s.done ? 'done' : 'not run'}</span>
                  <span className="block break-all text-xs text-slate-500">{s.file}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}
