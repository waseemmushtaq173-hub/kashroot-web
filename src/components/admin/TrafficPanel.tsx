'use client';

/**
 * Admin → Security → Sign-ins and traffic: what the server saw in the last
 * day (security_events, lib/server/securityLog) — sign-ins right and wrong,
 * sign-ups, reset emails, requests refused for going too fast, failed bot
 * checks, refused data requests and server errors — with, for each kind, how
 * many networks it came from and the busiest one (a hash, never an address).
 * Many wrong passwords or refusals from one network is a guessing attack or a
 * bot. Events from the admin's own network are counted apart ("yours"), so
 * testing does not look like an attack; "Count from now" counts only what
 * happens after a fix. "I am human" failures are grouped by code, each with
 * what it means, and email failures show the mail server's own reply.
 * Read-only.
 */
import { useCallback, useEffect, useState } from 'react';
import { Activity, Timer } from 'lucide-react';

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
  email_sent: { label: 'Emails sent' },
  email_failed: { label: 'Emails that failed', warn: true },
  gate_passed: { label: 'Security gate passed' },
};

/** What each security-check code means (Cloudflare's codes, KashRoot's own, Supabase's reasons). */
const CODE_MEANING: [RegExp, string][] = [
  [/\[number\]/, 'an older record, saved before codes were kept whole — press “Count from now” to see only new events'],
  [/^1102/, 'this site address is not allowed by the Cloudflare widget'],
  [/^1101/, 'the site key is wrong or not for this widget'],
  [/^1105|^1106/, 'this browser is too old or unsupported'],
  [/^2005/, 'the Cloudflare frame was blocked (browser setting or extension)'],
  [/^3000[0-2]/, 'the browser could not finish the check (often a VPN, ad-block or Shields)'],
  [/^3000/, 'the check timed out or got stuck in the browser'],
  [/^6000/, 'Cloudflare did not trust this browser and could not finish'],
  [/^gate: missing/, 'a sign-in, sign-up, reset or help request sent without passing the security gate first (a script, or a very old page)'],
  [/^gate: wrong-action/, 'a token made for a different form'],
  [/^gate: /, 'the security gate refused the token (the code after "gate:" says why)'],
  [/^honeypot/, 'a bot filled in the hidden field'],
  [/^too-fast/, 'a form sent faster than a person can type'],
  [/^script-blocked/, 'Cloudflare’s script could not load (Brave Shields, ad-block or no network)'],
  [/^no-answer/, 'no answer from Cloudflare within 8 s'],
  [/^reset-failed/, 'the check could not restart (the form had been closed)'],
  [/^unsupported/, 'this browser cannot run the check'],
  [/invalid-input-response/, 'a token Cloudflare did not accept: fake, or from a different widget than the secret (KashRoot’s own tests send fake ones)'],
  [/timeout-or-duplicate/, 'a token used twice or too old'],
  [/invalid-input-secret/, 'the secret itself is wrong'],
  [/no token/, 'a request came with no token at all'],
  [/another address/, 'a real token made on a different site'],
];
const meaning = (code: string) => CODE_MEANING.find(([re]) => re.test(code))?.[1] ?? '';
const SINCE_KEY = 'kr_security_since';
const readSince = () => {
  try {
    return localStorage.getItem(SINCE_KEY);
  } catch {
    return null;
  }
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
  // Security-check failures by code (no personal data), and how many of each kind came from the admin's own network.
  const [botCodes, setBotCodes] = useState<{ code: string; all: number; yours: number }[]>([]);
  const [kinds, setKinds] = useState<{ kind: string; all: number; yours: number }[]>([]);
  const [mailErrors, setMailErrors] = useState<{ at: string; detail: string }[]>([]);
  // The security gate, per portal: passed, refused (and how many of each were yours).
  const [gates, setGates] = useState<{ place: string; silent: number; tapped: number; button: number; failed: number; yours: number }[]>([]);
  // The check, by browser family and system ("Chrome on Android", no personal data): passed, failed on the first try, failed after Retry, and 600010s.
  const [browsers, setBrowsers] = useState<{ family: string; passed: number; firstFail: number; retryFail: number; c600010: number }[]>([]);
  // "Count from now": only what happened after this moment (kept in this browser).
  const [since, setSince] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [sum, ev, bot] = await Promise.all([
      supabase.rpc('kr_security_summary', { p_hours: 24 }),
      supabase.from('security_events').select('id, at, kind, ip_hash, path, status, detail').neq('kind', 'signin_ok').order('at', { ascending: false }).limit(40),
      supabase.from('security_events').select('at, kind, ip_hash, detail').neq('kind', 'signin_ok').gte('at', readSince() ?? new Date(Date.now() - 86_400_000).toISOString()).order('at', { ascending: false }).limit(2000),
    ]);
    const mine = ((await fetch('/api/security/me', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}))) as { net?: string }).net ?? '';
    setSince(readSince());
    setRows(sum.error ? null : ((sum.data ?? []) as Row[]));
    setRecent(ev.error ? [] : ((ev.data ?? []) as Event[]));
    const events = (bot.data ?? []) as { at: string; kind: string; ip_hash: string | null; detail: string | null }[];
    const byKind = new Map<string, { all: number; yours: number }>();
    const byCode = new Map<string, { all: number; yours: number }>();
    const byGate = new Map<string, { silent: number; tapped: number; button: number; failed: number; yours: number }>();
    const byBrowser = new Map<string, { passed: number; firstFail: number; retryFail: number; c600010: number }>();
    for (const e of events) {
      const yours = Boolean(mine) && e.ip_hash === mine;
      // " · Chrome on Android · first try" (lib/server/browserFamily), on gate passes and check failures since it was added.
      const ctx = (e.detail ?? '').match(/ · (.+?) · (first try|after Retry)/);
      if (ctx && (e.kind === 'gate_passed' || e.kind === 'bot_check_failed')) {
        const b = byBrowser.get(ctx[1]) ?? { passed: 0, firstFail: 0, retryFail: 0, c600010: 0 };
        const failed = e.kind === 'bot_check_failed';
        byBrowser.set(ctx[1], {
          passed: b.passed + (failed ? 0 : 1),
          firstFail: b.firstFail + (failed && ctx[2] === 'first try' ? 1 : 0),
          retryFail: b.retryFail + (failed && ctx[2] === 'after Retry' ? 1 : 0),
          c600010: b.c600010 + (failed && /\b600010\b/.test(e.detail ?? '') ? 1 : 0),
        });
      }
      // "gate_passed": "<place> (silent | after a tap | after the confirm button)"; a refused gate: "gate: <reason> (gate-<place>)".
      const passed = e.kind === 'gate_passed';
      const gatePlace = passed ? (e.detail ?? '').trim().split(/\s/)[0] : (e.detail ?? '').match(/^gate: .*\(gate-([a-z]+)\)/)?.[1];
      if (gatePlace) {
        const how = (e.detail ?? '').match(/\((silent|after a tap|after the confirm button)\)/)?.[1] ?? 'silent';
        const g = byGate.get(gatePlace) ?? { silent: 0, tapped: 0, button: 0, failed: 0, yours: 0 };
        byGate.set(gatePlace, {
          silent: g.silent + (passed && how === 'silent' ? 1 : 0),
          tapped: g.tapped + (passed && how === 'after a tap' ? 1 : 0),
          button: g.button + (passed && how === 'after the confirm button' ? 1 : 0),
          failed: g.failed + (passed ? 0 : 1),
          yours: g.yours + (yours ? 1 : 0),
        });
      }
      const k = byKind.get(e.kind) ?? { all: 0, yours: 0 };
      byKind.set(e.kind, { all: k.all + 1, yours: k.yours + (yours ? 1 : 0) });
      if (e.kind !== 'bot_check_failed') continue;
      // "browser: 110200 (signin) on kashroot-x.vercel.app" → "110200 on kashroot-x.vercel.app";
      // "browser: supabase-invalid-input-response (auth)" → that reason; server-side ones as they are.
      const d = (e.detail ?? 'unknown').replace(/^browser:\s*/, '').replace(/ · .+? · (first try|after Retry)/, '');
      const host = d.match(/ on ([a-z0-9.-]+)$/)?.[1];
      const code = `${d.replace(/ on [a-z0-9.-]+$/, '').replace(/\s*\(.*\)$/, '')}${host ? ` on ${host}` : ''}`;
      const c = byCode.get(code) ?? { all: 0, yours: 0 };
      byCode.set(code, { all: c.all + 1, yours: c.yours + (yours ? 1 : 0) });
    }
    setGates([...byGate].map(([place, v]) => ({ place, ...v })).sort((x, y) => y.silent + y.tapped + y.button + y.failed - (x.silent + x.tapped + x.button + x.failed)));
    setBrowsers([...byBrowser].map(([family, v]) => ({ family, ...v })).sort((x, y) => y.firstFail + y.retryFail - (x.firstFail + x.retryFail) || y.passed - x.passed));
    setKinds([...byKind].map(([kind, v]) => ({ kind, ...v })).sort((x, y) => y.all - x.all));
    setBotCodes([...byCode].map(([code, v]) => ({ code, ...v })).sort((x, y) => y.all - x.all));
    setMailErrors(events.filter((e) => e.kind === 'email_failed').slice(0, 5).map((e) => ({ at: e.at, detail: e.detail ?? '' })));
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
      <div className="mt-4 flex flex-wrap items-center gap-2" data-count-from>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(SINCE_KEY, new Date().toISOString());
            } catch {
              /* storage blocked */
            }
            void load();
          }}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          <Timer className="h-4 w-4" aria-hidden /> Count from now
        </button>
        {since && (
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem(SINCE_KEY);
              } catch {
                /* storage blocked */
              }
              void load();
            }}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm font-semibold text-slate-700 underline"
          >
            Back to the last 24 hours
          </button>
        )}
        <span className="text-xs text-slate-500">
          {since ? `Counting since ${new Date(since).toLocaleString('en-IN')} (this browser)` : 'The counts below: the last 24 hours'} · “yours” = from the network you are on now
        </span>
      </div>
      {kinds.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs" data-kind-counts>
          {kinds.map((k) => (
            <li key={k.kind} className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-800 ring-1 ring-slate-200">
              {KIND[k.kind]?.label ?? k.kind}: <strong>{k.all}</strong>
              {k.yours > 0 && <span className="text-slate-500"> ({k.yours} yours)</span>}
            </li>
          ))}
        </ul>
      )}
      {gates.length > 0 && (
        <div className="mt-4" data-gate-counts>
          <p className="text-sm font-semibold text-slate-800">Security gate, per portal</p>
          <ul className="mt-1 flex flex-wrap gap-2 text-xs">
            {gates.map((g) => (
              <li key={g.place} className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-800 ring-1 ring-slate-200">
                <strong>{g.place}</strong>: {g.silent} passed silently · {g.tapped} after a tap{g.button > 0 && <> · {g.button} after the confirm button</>}
                {g.failed > 0 && <span className="text-amber-800"> · {g.failed} refused</span>}
                {g.yours > 0 && <span className="text-slate-500"> ({g.yours} yours)</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">“Silent” and “after a tap” are as the person’s browser saw Cloudflare; the token itself is always checked with Cloudflare on the server.</p>
        </div>
      )}
      {browsers.length > 0 && (
        <div className="mt-4" data-check-browsers>
          <p className="text-sm font-semibold text-slate-800">“I am human” check, by browser</p>
          <div className="overflow-x-auto">
            <table className="mt-1 w-full text-left text-xs">
              <thead className="uppercase text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3">Browser</th>
                  <th className="py-1.5 pr-3">Gate passed</th>
                  <th className="py-1.5 pr-3">Failed, first try</th>
                  <th className="py-1.5 pr-3">Failed after Retry</th>
                  <th className="py-1.5">Of those, 600010</th>
                </tr>
              </thead>
              <tbody>
                {browsers.map((b) => (
                  <tr key={b.family} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-semibold text-slate-900">{b.family}</td>
                    <td className="py-1.5 pr-3">{b.passed}</td>
                    <td className={`py-1.5 pr-3 ${b.firstFail ? 'text-amber-800' : ''}`}>{b.firstFail}</td>
                    <td className={`py-1.5 pr-3 ${b.retryFail ? 'text-amber-800' : ''}`}>{b.retryFail}</td>
                    <td className="py-1.5">{b.c600010}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Failures are failure reports: one person can send several (each automatic try reports its code). Browser family and system only — no address, version or anything personal. Brave is told apart by the page itself.
          </p>
        </div>
      )}
      {botCodes.length > 0 && (
        <div className="mt-4" data-bot-codes>
          <p className="text-sm font-semibold text-slate-800">“I am human” check failures, by code</p>
          <ul className="mt-1 space-y-1 text-xs">
            {botCodes.map((c) => (
              <li key={c.code} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-950 ring-1 ring-amber-200">
                <span className="font-mono font-semibold">{c.code}</span>: {c.all}
                {c.yours > 0 && <span> ({c.yours} yours)</span>}
                {meaning(c.code) && <span className="text-amber-900/80"> — {meaning(c.code)}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">Test the whole check any time at /status → Test the security check.</p>
        </div>
      )}
      {mailErrors.length > 0 && (
        <div className="mt-4" data-mail-errors>
          <p className="text-sm font-semibold text-slate-800">Why emails failed (the mail server’s own reply)</p>
          <ul className="mt-1 space-y-1 text-xs">
            {mailErrors.map((m, i) => (
              <li key={i} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-950 ring-1 ring-rose-200">
                {new Date(m.at).toLocaleString('en-IN')} · {m.detail}
              </li>
            ))}
          </ul>
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
