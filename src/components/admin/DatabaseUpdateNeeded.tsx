/**
 * Shown to an admin account (never to anyone else) when the live database does
 * not yet have the KashRoot team update, so Admin cannot check who may open it.
 * Says exactly what to run. Opens nothing by itself.
 */
export function DatabaseUpdateNeeded() {
  return (
    <div role="alert" className="text-left">
      <h1 className="font-display text-2xl font-semibold text-slate-900">Admin is waiting for a database update</h1>
      <p className="mt-3 text-slate-700">
        The site was updated, but the database does not have the KashRoot team step yet (<code className="rounded bg-slate-100 px-1 text-sm">kr_team_member</code>). Until it does,
        Admin cannot confirm it is you, so it stays closed.
      </p>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-slate-800">
        <li>Open Supabase → your KashRoot project → SQL Editor → New query.</li>
        <li>
          Paste all of <code className="rounded bg-slate-100 px-1 text-sm">supabase/RUN_THIS_ONCE.sql</code> and press Run. It is safe to run again.
        </li>
        <li>Come back here and reload. Then Admin → Setup check: every row should say yes.</li>
      </ol>
    </div>
  );
}
