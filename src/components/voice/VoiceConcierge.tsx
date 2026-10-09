'use client';

/**
 * VoiceConcierge — ask by voice (or text), hear the answer in the same
 * language. Speech recognition and speech synthesis are the browser's (Web
 * Speech API); answers come from /api/ai, which reads live mandi and weather
 * data for prices and forecasts.
 *
 * Support: recognition works in Chrome/Edge/Safari (not Firefox) and needs
 * HTTPS + internet; the typed box works everywhere. Spoken replies need a
 * voice for the language installed on the device — Hindi is common, Urdu is
 * not; when missing, the reply is shown as text and the user is told why.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Send, Sparkles, Square, Volume2 } from 'lucide-react';

type Lang = 'en' | 'hi' | 'ur';
const LANGS: { id: Lang; label: string; speech: string }[] = [
  { id: 'en', label: 'English', speech: 'en-IN' },
  { id: 'hi', label: 'हिन्दी', speech: 'hi-IN' },
  { id: 'ur', label: 'اردو', speech: 'ur-IN' },
];

const SUGGESTIONS: Record<Lang, string[]> = {
  en: ['Today’s apple prices', 'Rain forecast for my district this week', 'How do I control apple scab?'],
  hi: ['आज सेब का भाव क्या है?', 'इस हफ़्ते बारिश का अनुमान', 'सेब में स्कैब कैसे रोकें?'],
  ur: ['آج سیب کی قیمت کیا ہے؟', 'اس ہفتے بارش کی پیشگوئی', 'سیب میں اسکیب کیسے روکیں؟'],
};

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  lang: Lang;
}

/* Minimal typing for the prefixed Web Speech recognition API. */
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Split into short sentences: Chrome's online voices stop after ~14 s. */
function chunks(text: string): string[] {
  return (text.match(/[^.!?।۔؟]+[.!?।۔؟]?/g) ?? [text]).map((s) => s.trim()).filter(Boolean).flatMap((s) => (s.length > 180 ? s.match(/.{1,180}(\s|$)/g) ?? [s] : [s]));
}

export function VoiceConcierge() {
  const [lang, setLang] = useState<Lang>('en');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [canListen, setCanListen] = useState(false);

  useEffect(() => {
    // Feature detection has to wait for the browser; this runs once.
    const id = requestAnimationFrame(() => setCanListen(getRecognition() !== null));
    window.speechSynthesis?.getVoices();
    return () => {
      cancelAnimationFrame(id);
      recRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, thinking]);

  const speak = (text: string, l: Lang) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      setNotice('This browser cannot speak replies aloud.');
      return;
    }
    synth.cancel();
    const code = LANGS.find((x) => x.id === l)!.speech;
    const voices = synth.getVoices();
    const voice = voices.find((v) => v.lang === code) ?? voices.find((v) => v.lang.toLowerCase().startsWith(l));
    if (!voice && l !== 'en') {
      setNotice(`No ${l === 'hi' ? 'Hindi' : 'Urdu'} voice is installed on this device, so the reply is shown as text. Adding the language in your phone’s text-to-speech settings enables spoken replies.`);
      return;
    }
    const parts = chunks(text);
    setSpeaking(true);
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = voice?.lang ?? code;
      if (voice) u.voice = voice;
      u.rate = 0.95;
      if (i === parts.length - 1) {
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
      }
      synth.speak(u);
    });
  };

  const ask = async (text: string, l: Lang) => {
    const question = text.trim();
    if (!question || thinking) return;
    setNotice(null);
    const history = turns.slice(-6).map(({ role, text: t }) => ({ role, text: t }));
    setTurns((all) => [...all, { role: 'user', text: question, lang: l }]);
    setDraft('');
    setThinking(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: question, lang: l, history }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      const reply = data.reply ?? data.error ?? 'Sorry, something went wrong.';
      setTurns((all) => [...all, { role: 'assistant', text: reply, lang: l }]);
      if (data.reply) speak(reply, l);
    } catch {
      setTurns((all) => [...all, { role: 'assistant', text: 'I could not reach the assistant. Check your internet connection.', lang: l }]);
    } finally {
      setThinking(false);
    }
  };

  const toggleListening = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getRecognition();
    if (!Ctor) {
      setNotice('Voice input is not supported in this browser — type your question instead (Chrome works best).');
      return;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    const rec = new Ctor();
    const l = lang;
    rec.lang = LANGS.find((x) => x.id === l)!.speech;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let live = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim(finalText + live);
    };
    rec.onerror = (e) => {
      const msg: Record<string, string> = {
        'not-allowed': 'Microphone permission was blocked. Allow the microphone for this site and try again.',
        'no-speech': 'I did not hear anything. Tap the mic and speak.',
        'language-not-supported': 'This browser cannot listen in that language yet — please type instead.',
        network: 'Voice recognition needs an internet connection.',
      };
      setNotice(msg[e.error] ?? 'Voice input stopped. Please try again.');
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
      if (finalText.trim()) void ask(finalText, l);
    };
    recRef.current = rec;
    setNotice(null);
    setListening(true);
    rec.start();
  };

  const rtl = lang === 'ur';

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-white/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.14)] ring-1 ring-white/70 backdrop-blur-xl sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-amber-300/50 to-rose-300/40 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Voice assistant
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Ask KashRoot anything</h2>
          <p className="mt-1 text-sm text-slate-600">Prices, weather and crop care — speak, and hear the answer in your language.</p>
        </div>
        <div role="group" aria-label="Language" className="flex rounded-xl bg-slate-900/5 p-1">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={lang === l.id}
              onClick={() => setLang(l.id)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition ${lang === l.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-6 grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
        {/* The orb */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={toggleListening}
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Speak your question'}
            className="group relative grid h-32 w-32 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-white shadow-[0_18px_40px_rgba(234,88,12,0.45),inset_0_-8px_20px_rgba(0,0,0,0.2),inset_0_8px_16px_rgba(255,255,255,0.35)] transition hover:scale-105 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-amber-500 motion-reduce:transition-none"
          >
            {listening && (
              <>
                <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-orange-400/40 motion-reduce:animate-none" />
                <span aria-hidden className="absolute -inset-3 animate-pulse rounded-full ring-4 ring-orange-300/60 motion-reduce:animate-none" />
              </>
            )}
            {listening ? <MicOff className="relative h-10 w-10" aria-hidden /> : <Mic className="relative h-10 w-10" aria-hidden />}
          </button>
          <p className="text-sm font-medium text-slate-600" aria-live="polite">
            {listening ? 'Listening…' : thinking ? 'Thinking…' : speaking ? 'Speaking…' : canListen ? 'Tap and speak' : 'Type below'}
          </p>
          {speaking && (
            <button type="button" onClick={() => { window.speechSynthesis.cancel(); setSpeaking(false); }} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900/5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-900/10">
              <Square className="h-3.5 w-3.5" aria-hidden /> Stop voice
            </button>
          )}
        </div>

        {/* Conversation */}
        <div className="min-w-0">
          <div ref={listRef} className="max-h-72 min-h-[9rem] space-y-3 overflow-y-auto rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-900/5" aria-live="polite">
            {turns.length === 0 && !interim && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS[lang].map((s) => (
                  <button key={s} type="button" dir={rtl ? 'rtl' : undefined} onClick={() => void ask(s, lang)} className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-900/10 transition hover:bg-amber-50 hover:ring-amber-300">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <p
                  dir={t.lang === 'ur' ? 'rtl' : undefined}
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${t.role === 'user' ? 'bg-gradient-to-br from-orange-500 to-rose-600 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-900/5'}`}
                >
                  {t.text}
                  {t.role === 'assistant' && (
                    <button type="button" aria-label="Play this answer" onClick={() => speak(t.text, t.lang)} className="ms-2 inline-flex cursor-pointer align-middle text-slate-400 hover:text-orange-600">
                      <Volume2 className="h-4 w-4" />
                    </button>
                  )}
                </p>
              </div>
            ))}
            {interim && (
              <p dir={rtl ? 'rtl' : undefined} className="ms-auto max-w-[85%] rounded-2xl bg-orange-100 px-4 py-2.5 text-sm italic text-orange-900">
                {interim}
              </p>
            )}
            {thinking && (
              <p className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking live data…
              </p>
            )}
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft, lang);
            }}
          >
            <label className="sr-only" htmlFor="voice-question">Your question</label>
            <input
              id="voice-question"
              dir={rtl ? 'rtl' : undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={lang === 'hi' ? 'अपना सवाल लिखें…' : lang === 'ur' ? 'اپنا سوال لکھیں…' : 'Or type your question…'}
              className="min-w-0 flex-1 rounded-xl border-0 bg-white px-4 py-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500"
            />
            <button type="submit" disabled={!draft.trim() || thinking} className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" aria-hidden /> Ask
            </button>
          </form>
          {notice && <p role="status" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{notice}</p>}
          <p className="mt-2 text-xs text-slate-500">Prices: Agmarknet (Govt. of India). Weather: Open-Meteo. Crop advice is general — check doses with an agronomist.</p>
        </div>
      </div>
    </div>
  );
}
