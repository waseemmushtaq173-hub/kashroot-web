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
import { CheckCircle2, ChevronDown, LifeBuoy, Loader2, MessageSquare, Search, Send, Square, Volume2 } from 'lucide-react';

import { HumanCheck, humanCheckOn } from '@/components/security/HumanCheck';
import { authFetch } from '@/lib/auth-fetch';
import { supabase } from '@/lib/supabase';
import { HELP_TOPICS, TOPIC_LABEL, type SupportTopic } from '@/lib/helpTopics';
import { isRtl, LANG_LABEL, speak, stopSpeaking, type SpeechLang } from '@/lib/client/speech';
import { rememberedLang, rememberLang } from '@/lib/langDetect';
import type { GuideText } from '@/lib/portalGuide';
import { HumanGate } from '@/components/security/HumanGate';

type Lang = 'en' | 'hi' | 'ur';
const LANGS: Lang[] = ['en', 'hi', 'ur'];
const pick = (t: GuideText, l: Lang) => t[l];

interface Msg {
  author: 'customer' | 'kashroot';
  author_name?: string | null;
  body: string;
  created_at: string;
}
interface Request {
  code: string;
  topic: SupportTopic;
  status: 'open' | 'answered' | 'closed';
  created_at: string;
  message: string;
  messages: Msg[];
}

const STATUS: Record<Request['status'], { text: string; tone: string }> = {
  open: { text: 'Waiting for KashRoot', tone: 'bg-amber-100 text-amber-900' },
  answered: { text: 'KashRoot replied', tone: 'bg-emerald-100 text-emerald-900' },
  closed: { text: 'Closed', tone: 'bg-slate-200 text-slate-800' },
};

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
      {r.messages.map((m, i) => (
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
  const [human, setHuman] = useState<string | null>(null);
  const [humanTry, setHumanTry] = useState(0);

  // Check my request
  const [check, setCheck] = useState({ code: '', phone: '' });
  const [found, setFound] = useState<Request | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Signed in: my requests
  const [mine, setMine] = useState<Request[] | null>(null);

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { data: rows, error } = await supabase
        .from('support_requests')
        .select('code, topic, status, created_at, message, support_messages(author, author_name, body, created_at)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!live || error || !rows) return;
      setMine(
        rows.map((r) => ({
          code: r.code,
          topic: r.topic as SupportTopic,
          status: r.status as Request['status'],
          created_at: r.created_at,
          message: r.message,
          messages: ((r.support_messages ?? []) as Msg[]).sort((a, b) => a.created_at.localeCompare(b.created_at)),
        })),
      );
    })();
    return () => {
      live = false;
    };
  }, []);

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
    setSending(true);
    const { ok, data } = await post({ action: 'open', ...form, lang, portal: null, human });
    setSending(false);
    setHumanTry((n) => n + 1);
    if (!ok || typeof data.code !== 'string') return setFormError(String(data.error ?? 'Could not send. Please try again.'));
    setSent(data.code);
    setCheck({ code: data.code, phone: form.phone });
    setForm((f) => ({ ...f, message: '' }));
  };

  const lookUp = async (code = check.code, phone = check.phone) => {
    setCheckError(null);
    setChecking(true);
    const { ok, data } = await post({ action: 'status', code, phone });
    setChecking(false);
    if (!ok || !data.request) {
      setFound(null);
      return setCheckError(String(data.error ?? 'Could not check. Please try again.'));
    }
    setFound(data.request as Request);
  };

  const addNote = async () => {
    if (!note.trim() || !found) return;
    const { ok, data } = await post({ action: 'add', code: found.code, phone: check.phone, body: note });
    if (!ok) return setCheckError(String(data.error ?? 'Could not send. Please try again.'));
    setNote('');
    await lookUp(found.code, check.phone);
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
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
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
              <HumanCheck onToken={setHuman} resetKey={humanTry} action="support" />
            </div>
            <button type="submit" disabled={sending || (humanCheckOn && !human)} className={`${button} bg-emerald-700 text-white hover:bg-emerald-800 sm:col-span-2 sm:justify-self-start`}>
              {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />} Send to KashRoot
            </button>
          </form>
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
            Mobile number you gave
            <input className={input} value={check.phone} onChange={(e) => setCheck({ ...check, phone: e.target.value })} inputMode="tel" required maxLength={16} />
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
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS[found.status].tone}`}>{STATUS[found.status].text}</span>
              <span className="text-sm text-slate-600">{TOPIC_LABEL[found.topic]}</span>
            </div>
            <Thread r={found} />
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
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS[r.status].tone}`}>{STATUS[r.status].text}</span>
                  <span className="text-sm text-slate-600">{TOPIC_LABEL[r.topic]}</span>
                </div>
                <Thread r={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-slate-700">
        You can also email <a className="font-semibold text-emerald-800 underline" href="mailto:support@kashroot.com">support@kashroot.com</a>. KashRoot never asks for your password, your OTP or your UPI PIN — do not share them with anyone.
      </p>
    </div>
  );
}
