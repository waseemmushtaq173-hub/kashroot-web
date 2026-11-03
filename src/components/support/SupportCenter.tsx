'use client';

/**
 * Help & Support, for every customer — signed in or not (sign-in trouble is
 * the most common reason to come here):
 *   1. the common problems, each with the steps that solve it, in big words
 *      and read aloud (lib/helpTopics) in English, Hindi or Urdu;
 *   2. "Ask KashRoot": a request with name, mobile and the problem; it gets a
 *      number (H-…) to quote, and KashRoot's team replies (Admin → Help desk);
 *   3. "Check my request": by its number and mobile, with the replies and a
 *      note back;
 *   4. signed in: "My help requests".
 * Requests go through app/api/support.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ChevronDown, LifeBuoy, Loader2, Mail, MessageSquare, Search, Send, ShieldCheck, Square, Volume2 } from 'lucide-react';

import { CHECKING_HUMAN, HumanCheckError, useHumanCheck } from '@/components/security/HumanCheck';
import { GUARD_TEXT, useFormGuard } from '@/lib/client/formGuard';
import { SecurityGate } from '@/components/security/SecurityGate';
import { authFetch } from '@/lib/auth-fetch';
import { supabase } from '@/lib/supabase';
import { HELP_TOPICS, TOPIC_LABEL, type SupportTopic } from '@/lib/helpTopics';
import { isRtl, LANG_LABEL, speak, stopSpeaking, type SpeechLang } from '@/lib/client/speech';
import { rememberedLang, rememberLang } from '@/lib/langDetect';
import { SITE_URL, SOCIAL_LINKS } from '@/lib/site';
import { NEVER_ASKS, SUPPORT_EMAIL, supportMailto } from '@/lib/supportEmail';
import type { GuideText } from '@/lib/portalGuide';
import { HumanGate } from '@/components/security/HumanGate';

type Lang = 'en' | 'hi' | 'ur';
const LANGS: Lang[] = ['en', 'hi', 'ur'];
const pick = (t: GuideText, l: Lang) => t[l];

interface Msg {
  author: 'customer' | 'kashroot' | 'internal';
  author_name?: string | null;
  body: string;
  created_at: string;
}
interface Request {
  code: string;
  topic: SupportTopic;
  status: 'open' | 'in_progress' | 'answered' | 'closed';
  created_at: string;
  updated_at?: string;
  message: string;
  messages: Msg[];
}

const STATUS: Record<Request['status'], { text: string; tone: string }> = {
  open: { text: 'Received', tone: 'bg-amber-100 text-amber-900' },
  in_progress: { text: 'Being looked at', tone: 'bg-sky-100 text-sky-900' },
  answered: { text: 'Answered', tone: 'bg-emerald-100 text-emerald-900' },
  closed: { text: 'Resolved', tone: 'bg-slate-200 text-slate-800' },
};
const STEPS: Request['status'][] = ['open', 'in_progress', 'answered', 'closed'];

/** Received → Being looked at → Answered → Resolved, with where this request is. */
function Steps({ status }: { status: Request['status'] }) {
  const at = STEPS.indexOf(status);
  return (
    <ol aria-label="Where your request is" className="flex list-none flex-wrap gap-1.5 !pl-0 text-sm" data-support-status={status}>
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? 'step' : undefined} className={`rounded-full px-3 py-1 font-semibold ${i < at ? 'bg-emerald-50 text-emerald-800' : i === at ? STATUS[s].tone + ' ring-2 ring-offset-1 ring-slate-400' : 'bg-slate-100 text-slate-400'}`}>
          {i < at ? '✓ ' : ''}
          {STATUS[s].text}
        </li>
      ))}
    </ol>
  );
}

/** "This solved my problem" / "Still need help" — once KashRoot has answered (or reopen a resolved one). */
function Settle({ r, onSettle }: { r: Request; onSettle: (solved: boolean) => void }) {
  if (r.status !== 'answered' && r.status !== 'closed') return null;
  return (
    <div className="flex flex-wrap gap-2">
      {r.status === 'answered' && (
        <button type="button" onClick={() => onSettle(true)} className={`${button} bg-emerald-700 text-white hover:bg-emerald-800`}>
          <CheckCircle2 className="h-5 w-5" aria-hidden /> This solved my problem
        </button>
      )}
      <button type="button" onClick={() => onSettle(false)} className={`${button} bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50`}>
        <MessageSquare className="h-5 w-5" aria-hidden /> Still need help
      </button>
    </div>
  );
}

/** Last time this browser saw each of the person's requests, for "New reply". */
const SEEN_KEY = 'kr_help_seen';
function seenAt(code: string): string {
  try {
    return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string>)[code] ?? '';
  } catch {
    return '';
  }
}
function markSeen(codes: string[]) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string>;
    const now = new Date().toISOString();
    for (const c of codes) seen[c] = now;
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage blocked: "New reply" may show again */
  }
}

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const input = 'min-h-12 w-full rounded-xl border-0 bg-white px-4 text-base text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-600';
const button = 'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-60';

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await authFetch('/api/support', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, data: { error: 'No internet connection. Please check your mobile data and try again.' } };
  }
}

/** The conversation of one request. */
function Thread({ r }: { r: Request }) {
  return (
    <div className="space-y-2">
      <p className="rounded-2xl bg-slate-100 p-3 text-slate-800">
        <span className="block text-xs font-semibold text-slate-500">You · {when(r.created_at)}</span>
        {r.message}
      </p>
      {r.messages.filter((m) => m.author !== 'internal').map((m, i) => (
        <p key={i} className={`rounded-2xl p-3 ${m.author === 'kashroot' ? 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-800'}`}>
          <span className="block text-xs font-semibold text-slate-500">{m.author === 'kashroot' ? m.author_name || 'KashRoot support' : 'You'} · {when(m.created_at)}</span>
          {m.body}
        </p>
      ))}
    </div>
  );
}

export function SupportCenter() {
  const params = useSearchParams();
  const askedTopic = params.get('topic') as SupportTopic | null;
  const [lang, setLang] = useState<Lang>(() => {
    const l = rememberedLang();
    return l === 'hi' || l === 'ur' ? l : l === 'ks' ? 'ur' : 'en';
  });
  const [open, setOpen] = useState<string | null>(askedTopic === 'login' ? 'otp' : null);
  const [reading, setReading] = useState<string | null>(null);

  // Ask KashRoot
  const [form, setForm] = useState({ name: '', phone: '', email: '', topic: (askedTopic && askedTopic in TOPIC_LABEL ? askedTopic : 'login') as SupportTopic, message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const human = useHumanCheck('support', { lazy: true });
  // Bot traps (checked again on the server): a hidden field, and at least 3 s to write the request.
  const guard = useFormGuard(3000, 'support');

  // Check my request
  // From the "your request has a reply" email: the number is filled in.
  const [check, setCheck] = useState(() => {
    const code = (params.get('code') ?? '').trim().toUpperCase();
    return { code: /^H-[0-9A-F]{8}$/.test(code) ? code : '', contact: '' };
  });
  const [found, setFound] = useState<Request | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Signed in: my requests, and which have a reply this browser has not seen
  const [mine, setMine] = useState<Request[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [mineTry, setMineTry] = useState(0);

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { data: rows, error } = await supabase
        .from('support_requests')
        .select('code, topic, status, created_at, updated_at, message, support_messages(author, author_name, body, created_at)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!live || error || !rows) return;
      const list = rows.map((r) => ({
        code: r.code,
        topic: r.topic as SupportTopic,
        status: r.status as Request['status'],
        created_at: r.created_at,
        updated_at: r.updated_at,
        message: r.message,
        messages: ((r.support_messages ?? []) as Msg[]).filter((m) => m.author !== 'internal').sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }));
      // A reply newer than this browser last looked: "New reply".
      setFresh(new Set(list.filter((r) => r.messages.some((m) => m.author === 'kashroot' && m.created_at > seenAt(r.code))).map((r) => r.code)));
      markSeen(list.map((r) => r.code));
      setMine(list);
    })();
    return () => {
      live = false;
    };
  }, [mineTry]);

  const read = useCallback(
    (id: string, text: string) => {
      if (reading === id) {
        stopSpeaking();
        setReading(null);
        return;
      }
      setReading(id);
      void speak(text, lang as SpeechLang, undefined, () => setReading((now) => (now === id ? null : now))).then((r) => {
        if (r !== 'spoken') setReading(null);
      });
    },
    [lang, reading],
  );

  const send = async () => {
    setFormError(null);
    const guarded = guard.check();
    if (guarded !== 'ok') return setFormError(GUARD_TEXT[guarded]);
    setSending(true);
    let token: string | undefined;
    try {
      token = await human.token();
    } catch (problem) {
      setSending(false);
      return setFormError(problem instanceof HumanCheckError ? null : (problem as Error).message);
    }
    const { ok, data } = await post({ action: 'open', ...form, lang, portal: null, human: token, trap: guard.trapValue(), ms: guard.elapsed() });
    setSending(false);
    human.used();
    if (!ok || typeof data.code !== 'string') return setFormError(String(data.error ?? 'Could not send. Please try again.'));
    setSent(data.code);
    setCheck({ code: data.code, contact: form.phone });
    setForm((f) => ({ ...f, message: '' }));
  };

  const lookUp = async (code = check.code, contact = check.contact) => {
    setCheckError(null);
    setChecking(true);
    const { ok, data } = await post({ action: 'status', code, contact });
    setChecking(false);
    if (!ok || !data.request) {
      setFound(null);
      return setCheckError(String(data.error ?? 'Could not check. Please try again.'));
    }
    setFound(data.request as Request);
  };

  const addNote = async () => {
    if (!note.trim() || !found) return;
    const { ok, data } = await post({ action: 'add', code: found.code, contact: check.contact, body: note });
    if (!ok) return setCheckError(String(data.error ?? 'Could not send. Please try again.'));
    setNote('');
    await lookUp(found.code, check.contact);
  };

  /** "This solved my problem" / "Still need help", for the request found by number. */
  const settleFound = async (solved: boolean) => {
    if (!found) return;
    const { ok, data } = await post({ action: 'feedback', code: found.code, contact: check.contact, solved });
    if (!ok) return setCheckError(String(data.error ?? 'Could not send. Please try again.'));
    await lookUp(found.code, check.contact);
  };

  /** … for one of my requests (signed in). */
  const settleMine = async (code: string, solved: boolean) => {
    const { error } = await supabase.rpc('kr_support_feedback_mine', { p_code: code, p_solved: solved });
    if (error) return setCheckError('Could not send. Please try again.');
    setMineTry((n) => n + 1);
  };

  const askAbout = (topic: SupportTopic) => {
    setForm((f) => ({ ...f, topic }));
    document.getElementById('ask-kashroot')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-10 [&_h2]:font-serif">
      {/* KashRoot's voice needs the "I am human" pass; shown only when asked for. */}
      <HumanGate />
      {/* Language for the answers (and the voice) */}
      <div role="group" aria-label="Language" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-600">Language:</span>
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            onClick={() => {
              stopSpeaking();
              setReading(null);
              setLang(l);
              rememberLang(l);
            }}
            className={`min-h-11 min-w-11 cursor-pointer rounded-xl px-4 text-sm font-bold ring-1 ${lang === l ? 'bg-emerald-700 text-white ring-emerald-800' : 'bg-white text-slate-800 ring-slate-300 hover:bg-emerald-50'}`}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>

      {/* 1. Common problems */}
      <section aria-labelledby="common-title">
        <h2 id="common-title" className="flex items-center gap-2 text-2xl">
          <LifeBuoy className="h-6 w-6 text-emerald-700" aria-hidden /> Choose your problem
        </h2>
        <ul className="mt-4 list-none space-y-3 !pl-0">
          {HELP_TOPICS.map((t) => {
            const isOpen = open === t.id;
            return (
              <li key={t.id} data-help-topic={t.id} className="rounded-2xl bg-white ring-1 ring-slate-200">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : t.id)}
                  dir={isRtl(lang) ? 'rtl' : undefined}
                  className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3 text-start text-lg font-semibold text-slate-900 hover:bg-emerald-50"
                >
                  {pick(t.title, lang)}
                  <ChevronDown className={`h-5 w-5 shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {isOpen && (
                  <div className="space-y-3 px-4 pb-4">
                    <p dir={isRtl(lang) ? 'rtl' : undefined} className="text-lg leading-relaxed text-slate-800">
                      {pick(t.steps, lang)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => read(t.id, pick(t.steps, lang))} className={`${button} bg-emerald-700 text-white hover:bg-emerald-800`}>
                        {reading === t.id ? <Square className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
                        {reading === t.id ? 'Stop' : 'Listen'}
                      </button>
                      <button type="button" onClick={() => askAbout(t.topic)} className={`${button} bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50`}>
                        <MessageSquare className="h-5 w-5" aria-hidden /> Still stuck? Ask KashRoot
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 2. Ask KashRoot */}
      <section id="ask-kashroot" aria-labelledby="ask-title" className="scroll-mt-24 rounded-3xl bg-emerald-50/70 p-5 ring-1 ring-emerald-200 sm:p-6">
        <h2 id="ask-title" className="text-2xl">Ask KashRoot</h2>
        <p className="mt-1 text-slate-700">A person from KashRoot’s team reads it and replies here, or calls you. You do not need to be signed in.</p>
        {sent ? (
          <div role="status" className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-emerald-300">
            <p className="flex items-center gap-2 text-lg font-bold text-emerald-900">
              <CheckCircle2 className="h-6 w-6" aria-hidden /> Sent. Your request number:
            </p>
            <p data-support-code className="mt-2 font-mono text-3xl font-bold tracking-wider text-slate-900">{sent}</p>
            <p className="mt-2 text-slate-700">Write it down. With it and your mobile number you can check for replies below.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => read('code', `Your request number is ${sent.split('').join(' ')}`)} className={`${button} bg-emerald-700 text-white hover:bg-emerald-800`}>
                <Volume2 className="h-5 w-5" aria-hidden /> Read the number aloud
              </button>
              <button type="button" onClick={() => setSent(null)} className={`${button} bg-white text-slate-900 ring-1 ring-slate-300`}>
                Ask something else
              </button>
            </div>
          </div>
        ) : (
          <SecurityGate place="support" onPass={human.start}>
            <form
              className="mt-4 grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {guard.trap}
              <label className="grid gap-1.5 text-sm font-semibold text-slate-800">
                Your name
                <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required maxLength={80} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-800">
                Mobile number (we call you back on it)
                <input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" autoComplete="tel" required maxLength={16} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-800">
                Email (optional)
                <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" maxLength={120} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-800">
                What is it about?
                <select className={input} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value as SupportTopic })}>
                  {(Object.keys(TOPIC_LABEL) as SupportTopic[]).map((t) => (
                    <option key={t} value={t}>{TOPIC_LABEL[t]}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-slate-800 sm:col-span-2">
                The problem, in your words (any language)
                <textarea className={`${input} min-h-32 py-3`} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required minLength={5} maxLength={2000} />
              </label>
              {formError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-900 ring-1 ring-rose-200 sm:col-span-2">{formError}</p>}
              <div className="sm:col-span-2">
                {human.element}
              </div>
              <button type="submit" disabled={sending} className={`${button} bg-emerald-700 text-white hover:bg-emerald-800 sm:col-span-2 sm:justify-self-start`}>
                {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />} {human.waiting ? CHECKING_HUMAN : 'Send to KashRoot'}
              </button>
            </form>
          </SecurityGate>
        )}
      </section>

      {/* 3. Check my request */}
      <section aria-labelledby="check-title">
        <h2 id="check-title" className="text-2xl">Check my request</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void lookUp();
          }}
        >
          <label className="grid gap-1.5 text-sm font-semibold text-slate-800">
            Request number
            <input className={`${input} font-mono uppercase`} value={check.code} onChange={(e) => setCheck({ ...check, code: e.target.value })} placeholder="H-3F9A2C1B" required maxLength={12} />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-800">
            Mobile number or email you gave
            <input className={input} value={check.contact} onChange={(e) => setCheck({ ...check, contact: e.target.value })} autoComplete="tel" required maxLength={120} />
          </label>
          <button type="submit" disabled={checking} className={`${button} bg-slate-900 text-white hover:bg-slate-800`}>
            {checking ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Search className="h-5 w-5" aria-hidden />} Check
          </button>
        </form>
        {checkError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-rose-900 ring-1 ring-rose-200">{checkError}</p>}
        {found && (
          <div data-support-found className="mt-4 space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold">{found.code}</span>
              <span className="text-sm text-slate-600">{TOPIC_LABEL[found.topic]}</span>
              <span className="text-sm text-slate-500">sent {when(found.created_at)}{found.updated_at ? ` · last change ${when(found.updated_at)}` : ''}</span>
            </div>
            <Steps status={found.status} />
            <Thread r={found} />
            <Settle r={found} onSettle={(solved) => void settleFound(solved)} />
            {found.status !== 'closed' && (
              <div className="grid gap-2">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-800">
                  Add a note
                  <textarea className={`${input} min-h-24 py-3`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
                </label>
                <button type="button" onClick={() => void addNote()} disabled={!note.trim()} className={`${button} justify-self-start bg-emerald-700 text-white hover:bg-emerald-800`}>
                  <Send className="h-5 w-5" aria-hidden /> Send note
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 4. Signed in: my requests */}
      {mine && mine.length > 0 && (
        <section aria-labelledby="mine-title">
          <h2 id="mine-title" className="text-2xl">My help requests</h2>
          <ul className="mt-4 list-none space-y-3 !pl-0">
            {mine.map((r) => (
              <li key={r.code} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold">{r.code}</span>
                  <span className="text-sm text-slate-600">{TOPIC_LABEL[r.topic]}</span>
                  {fresh.has(r.code) && <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-xs font-bold text-white">New reply</span>}
                </div>
                <Steps status={r.status} />
                <Thread r={r} />
                <Settle r={r} onSettle={(solved) => void settleMine(r.code, solved)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5. Official contacts — the only place on the site with KashRoot's email address */}
      <section id="official" aria-labelledby="official-title" className="scroll-mt-24 rounded-3xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
        <h2 id="official-title" className="flex items-center gap-2 text-2xl">
          <ShieldCheck className="h-6 w-6 text-emerald-700" aria-hidden /> Official contacts
        </h2>
        <p className="mt-3 rounded-2xl bg-amber-50 p-4 font-semibold text-amber-950 ring-1 ring-amber-200">{NEVER_ASKS}</p>
        <ul className="mt-4 space-y-3 !pl-0 text-slate-800 [list-style:none]">
          <li className="[list-style:none]">
            <span className="font-semibold">Website:</span> {new URL(SITE_URL).host} — sign in only on this address.
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <a href={supportMailto()} className={`${button} bg-emerald-700 text-white no-underline hover:bg-emerald-800 hover:no-underline`} data-email-us>
              <Mail className="h-5 w-5" aria-hidden /> Email us
            </a>
            <span className="text-sm text-slate-600">
              KashRoot’s emails — replies, notices, sign-in emails — come only from {SUPPORT_EMAIL}. Any other address that claims to be KashRoot is fake.
            </span>
          </li>
          <li className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold">Social pages:</span>
            {SOCIAL_LINKS.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer me" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">
                {l.label}
              </a>
            ))}
          </li>
        </ul>
      </section>
    </div>
  );
}
