'use client';

/**
 * VoiceConcierge — ask by voice (or text), hear the answer in your language:
 * Kashmiri, Urdu, Hindi or English. Answers come from /api/ai (Claude with
 * live mandi and weather data); speaking and listening use the browser
 * (src/lib/client/speech.ts). Errors are spoken as well as shown.
 *
 * Listening works in Chrome/Edge/Safari (not Firefox; Brave blocks it). No
 * browser recognises Kashmiri speech yet, so in Kashmiri it listens in Urdu.
 */
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Loader2, Mic, MicOff, Send, Sparkles, Square, Volume2 } from 'lucide-react';

import { LangPicker } from '@/components/voice/VoiceButtons';
import { useAssistant } from '@/lib/client/assistant';
import { isRtl, listen, recognitionAvailable, type SpeechLang } from '@/lib/client/speech';
import { loadAccount } from '@/lib/db/client';

const SUGGESTIONS: Record<SpeechLang, string[]> = {
  en: ['Today’s apple prices', 'Rain forecast for my district this week', 'How do I control apple scab?', 'How do I book cold storage?'],
  hi: ['आज सेब का भाव क्या है?', 'इस हफ़्ते बारिश का अनुमान', 'सेब में स्कैब कैसे रोकें?', 'कोल्ड स्टोरेज कैसे बुक करें?'],
  ur: ['آج سیب کی قیمت کیا ہے؟', 'اس ہفتے بارش کی پیشگوئی', 'سیب میں اسکیب کیسے روکیں؟', 'کولڈ اسٹوریج کیسے بک کریں؟'],
  ks: ['اَز چھُ سیبُک ریٹ کیا؟', 'یَتھ ہفتس منٛز روٗد آسہِ؟', 'سیبس اسکیب کِتھ کٔنۍ رُکاو؟', 'کولڈ سٹور کِتھ کٔنۍ بُک کرو؟'],
};

const PLACEHOLDER: Record<SpeechLang, string> = { en: 'Or type your question…', hi: 'अपना सवाल लिखें…', ur: 'اپنا سوال لکھیں…', ks: 'پنُن سوال لیٚکھِو…' };

export function VoiceConcierge() {
  const [lang, setLang] = useState<SpeechLang>('en');
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const { turns, ask, thinking, speaking, say, stop, notice, setNotice, configured } = useAssistant();
  const stopListening = useRef<(() => void) | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setCanListen(recognitionAvailable()));
    void loadAccount().then((a) => a?.lang && setLang(a.lang)).catch(() => undefined);
    return () => {
      cancelAnimationFrame(id);
      stopListening.current?.();
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, thinking]);

  const send = (text: string) => {
    setDraft('');
    void ask(text, lang);
  };

  const toggleListening = () => {
    if (listening) {
      stopListening.current?.();
      return;
    }
    stop();
    setNotice(null);
    stopListening.current = listen(lang, {
      onText: setInterim,
      onDone: (finalText) => {
        setListening(false);
        setInterim('');
        if (finalText) send(finalText);
      },
      onError: setNotice,
    });
    if (!stopListening.current) return setNotice('Voice input is not supported in this browser — type your question instead (Chrome works best).');
    setListening(true);
  };

  const rtl = isRtl(lang) ? 'rtl' : undefined;

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-white/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.14)] ring-1 ring-white/70 backdrop-blur-xl sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-amber-300/50 to-rose-300/40 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Voice assistant
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Ask KashRoot anything</h2>
          <p className="mt-1 text-sm text-slate-600">Prices, weather, crop care and how to use KashRoot — speak, and hear the answer in Kashmiri, Urdu, Hindi or English.</p>
        </div>
        <LangPicker value={lang} onChange={setLang} />
      </div>

      {configured === false && (
        <p role="alert" className="relative mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> The voice assistant is not connected yet. The site owner needs to add ANTHROPIC_API_KEY in Vercel and redeploy.
        </p>
      )}

      <div className="relative mt-6 grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
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
          {lang === 'ks' && canListen && <p className="max-w-[10rem] text-center text-xs text-slate-500">Speak in Kashmiri or Urdu</p>}
          {speaking && (
            <button type="button" onClick={stop} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900/5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-900/10">
              <Square className="h-3.5 w-3.5" aria-hidden /> Stop voice
            </button>
          )}
        </div>

        <div className="min-w-0">
          <div ref={listRef} className="max-h-72 min-h-[9rem] space-y-3 overflow-y-auto rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-900/5" aria-live="polite">
            {turns.length === 0 && !interim && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS[lang].map((s) => (
                  <button key={s} type="button" dir={rtl} onClick={() => send(s)} className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-900/10 transition hover:bg-amber-50 hover:ring-amber-300">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <p
                  dir={isRtl(t.lang) && !t.error ? 'rtl' : undefined}
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${t.role === 'user' ? 'bg-gradient-to-br from-orange-500 to-rose-600 text-white' : t.error ? 'bg-rose-50 text-rose-900 ring-1 ring-rose-200' : 'bg-white text-slate-800 ring-1 ring-slate-900/5'}`}
                >
                  {t.text}
                  {t.role === 'assistant' && !t.error && (
                    <button type="button" aria-label="Play this answer" onClick={() => void say(t)} className="ms-2 inline-flex cursor-pointer align-middle text-slate-400 hover:text-orange-600">
                      <Volume2 className="h-4 w-4" />
                    </button>
                  )}
                </p>
              </div>
            ))}
            {interim && (
              <p dir={rtl} className="ms-auto max-w-[85%] rounded-2xl bg-orange-100 px-4 py-2.5 text-sm italic text-orange-900">
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
              send(draft);
            }}
          >
            <label className="sr-only" htmlFor="voice-question">Your question</label>
            <input
              id="voice-question"
              dir={rtl}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={PLACEHOLDER[lang]}
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
