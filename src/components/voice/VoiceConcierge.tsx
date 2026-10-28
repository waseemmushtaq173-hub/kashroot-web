'use client';

/**
 * VoiceConcierge — ask by voice (or text), hear the answer in your language:
 * Kashmiri, Urdu, Hindi, Dogri or English. Answers come from /api/ai (the
 * assistant, with live mandi and weather data); speaking and listening use
 * the browser (src/lib/client/speech.ts). Errors are spoken as well as shown.
 *
 * Asking KashRoot to do something — "walnut rate in Sopore", "Me chhu 50
 * dabbe seeb sozun", "track load KR-8823" — brings up a card (voiceAction in
 * lib/navIntent.ts): the page that does it, with its form filled in, opened
 * with one tap on Open. The card is read aloud; a price question is answered
 * first, then the card is read.
 *
 * Listening works in Chrome/Edge/Safari (not Firefox; Brave blocks it). No
 * browser recognises Kashmiri speech yet, so in Kashmiri it listens in Urdu;
 * nor Dogri, so in Dogri it listens and answers in Hindi. The only built-in
 * Kashmiri sentences are the ones the editors wrote (lib/kashmiri/phrases.ts),
 * so a card for a Kashmiri speaker is shown in Urdu, and says so.
 *
 * The first suggestions follow the person's area (lib/region.ts): apples and
 * walnuts in Kashmir, cardamom and pepper in Kerala. `compact` is the
 * floating panel's layout (FloatingVoice); `autoListen` starts listening as
 * it opens.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CircleAlert, Keyboard, Loader2, Mic, MicOff, Send, Sparkles, Square, Volume2, X } from 'lucide-react';

import { KashmiriKeys } from '@/components/kashmiri/KashmiriKeys';
import { RegionChip } from '@/components/voice/RegionChip';
import { heard, LangPicker, type VoiceLang } from '@/components/voice/VoiceButtons';
import { useAssistant } from '@/lib/client/assistant';
import { ksText } from '@/lib/kashmiri/phrases';
import { isRtl, listen, noListenHelp, recognitionAvailable } from '@/lib/client/speech';
import { loadAccount } from '@/lib/db/client';
import { detectReplyLang, rememberedLang, rememberLang } from '@/lib/langDetect';
import { actionSentence, openingLine, voiceAction, type VoiceAction } from '@/lib/navIntent';
import { cropNamed, useRegion, type Crop } from '@/lib/region';
import { HumanGate } from '@/components/security/HumanGate';

interface Suggestion {
  text: string;
  /** Set for a line not in the picked language's script (the owner's romanised Kashmiri). */
  dir?: 'ltr';
}

/**
 * The first suggestions name the area's own crops. Kashmiri lines are the
 * editors' sentences (lib/kashmiri/phrases.ts) and two the owner gave.
 */
function suggestionsFor(lang: VoiceLang, crops: Crop[]): Suggestion[] {
  if (lang === 'ks') {
    return [
      ...([1, 2, 3, 4] as const).map((i) => ({ text: ksText(`assistant.suggest.${i}`) })),
      { text: 'Sopore mandi manz kya bhaav chhu az?', dir: 'ltr' as const },
      { text: 'Me chhu 50 dabbe seeb sozun', dir: 'ltr' as const },
    ];
  }
  const c1 = crops[0] ?? cropNamed('Apple')!;
  const c2 = crops[1] ?? (crops.length ? crops[0] : cropNamed('Walnut')!);
  // Apple growers (and anyone whose area is not known yet: KashRoot starts in Kashmir).
  const apples = !crops.length || crops.some((c) => c.name === 'Apple');
  const lines: Record<'en' | 'hi' | 'ur', string[]> = {
    en: [`Today’s ${c1.label.en.toLowerCase()} rate`, `Find the cheapest ${c2.label.en.toLowerCase()}`, ...(apples ? ['Sell 50 boxes of apples'] : []), 'Rain forecast for my district this week', 'How do I book cold storage?'],
    hi: [`आज ${c1.label.hi} का भाव`, `सबसे कम दाम में ${c2.label.hi}`, ...(apples ? ['50 पेटी सेब बेचने हैं'] : []), 'इस हफ़्ते बारिश का अनुमान', 'कोल्ड स्टोरेज कैसे बुक करें?'],
    ur: [`آج ${c1.label.ur} کا بھاؤ`, `سب سے کم دام میں ${c2.label.ur}`, ...(apples ? ['50 پیٹی سیب بیچنے ہیں'] : []), 'اس ہفتے بارش کی پیشگوئی', 'کولڈ اسٹوریج کیسے بک کریں؟'],
  };
  return lines[lang === 'doi' ? 'hi' : lang].map((text) => ({ text }));
}

const PLACEHOLDER: Record<'en' | 'hi' | 'ur', string> = { en: 'Or type your question…', hi: 'अपना सवाल लिखें…', ur: 'اپنا سوال لکھیں…' };

/** The lang attribute for text in this language (fonts, screen readers). */
const langAttr = (l: VoiceLang) => (l === 'en' ? undefined : l);
/** The written language of a card: Kashmiri cards are in Urdu, Dogri ones in Hindi. */
const cardText = (l: VoiceLang): 'en' | 'hi' | 'ur' => (l === 'ks' ? 'ur' : l === 'doi' ? 'hi' : l);

/** Dogri is remembered next to the phone's language (which then says Hindi). */
const DOGRI_KEY = 'kr_lang_dogri';
/**
 * Under an answer from KashRoot's answer bank: whose answer it is. Said
 * plainly, so nobody takes the assistant for a person or an expert's answer
 * for the AI's. (Kashmiri shows the English line until the editors add theirs.)
 */
function ExpertCredit({ from, lang }: { from: { name: string; reviewed: boolean }; lang: string }) {
  const text = from.reviewed
    ? lang === 'hi'
      ? `KashRoot विशेषज्ञ ${from.name} ने जाँचा और मंज़ूर किया`
      : lang === 'ur'
        ? `KashRoot ماہر ${from.name} نے جانچا اور منظور کیا`
        : `Checked and approved by KashRoot expert ${from.name}`
    : lang === 'hi'
      ? `KashRoot विशेषज्ञ ${from.name} का जवाब`
      : lang === 'ur'
        ? `KashRoot ماہر ${from.name} کا جواب`
        : `Answer from KashRoot expert ${from.name}`;
  return (
    <span dir={lang === 'ur' ? 'rtl' : undefined} className="mt-1 inline-flex max-w-[85%] items-center gap-1 text-xs font-semibold text-emerald-800">
      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> {text}
    </span>
  );
}

function dogriRemembered(): boolean {
  try {
    return localStorage.getItem(DOGRI_KEY) === '1';
  } catch {
    return false;
  }
}
function rememberVoiceLang(l: VoiceLang) {
  rememberLang(heard(l));
  try {
    if (l === 'doi') localStorage.setItem(DOGRI_KEY, '1');
    else localStorage.removeItem(DOGRI_KEY);
  } catch {
    /* storage blocked */
  }
}

interface Card {
  action: VoiceAction;
  /** What they said, shown on the card. */
  said: string;
  lang: VoiceLang;
}

export function VoiceConcierge({ compact = false, autoListen = false, onNavigate }: { compact?: boolean; autoListen?: boolean; onNavigate?: () => void } = {}) {
  const router = useRouter();
  const [lang, setLang] = useState<VoiceLang>('en');
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const [listenHelp, setListenHelp] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const { turns, ask, thinking, speaking, say, stop, notice, setNotice, configured } = useAssistant();
  // The area's crops (RegionChip below finds the area, also from the district in My details).
  const { crops } = useRegion();
  const stopListening = useRef<(() => void) | null>(null);
  /** A price question's card, read once the answer has been read. */
  const cardAfterAnswer = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [keys, setKeys] = useState(false);
  const t = ksText;
  const ks = lang === 'ks';
  const speechLang = heard(lang);
  const suggestions = suggestionsFor(lang, crops);
  const inputId = compact ? 'voice-question-float' : 'voice-question';

  const sayCard = (c: Card) => {
    const l = cardText(c.lang);
    // Urdu cards also come in Devanagari, for phones with only a Hindi voice.
    void say({ text: actionSentence(c.action, l), lang: l, speech: l === 'ur' ? actionSentence(c.action, 'hi') : undefined });
  };

  const send = (text: string) => {
    const question = text.trim();
    if (!question || thinking) return;
    setDraft('');
    // Switch the buttons (and the microphone) to the language they used — Dogri stays Dogri.
    const used = detectReplyLang(question, speechLang);
    const next: VoiceLang = lang === 'doi' && used === 'hi' ? 'doi' : used;
    if (next !== lang) setLang(next);
    const action = voiceAction(question);
    const c = action ? { action, said: question, lang: next } : null;
    setCard(c);
    cardAfterAnswer.current = Boolean(action?.answer);
    if (c && !c.action.answer) {
      if (next !== lang) rememberVoiceLang(next);
      setNotice(null);
      sayCard(c);
      return;
    }
    void ask(question, speechLang);
  };

  // Listening ends after the render that started it: always send with the latest state.
  const sendLatest = useRef(send);
  useEffect(() => {
    sendLatest.current = send;
  });

  const startListening = (l: VoiceLang) => {
    stop();
    setNotice(null);
    stopListening.current = listen(heard(l), {
      onText: setInterim,
      onDone: (finalText) => {
        setListening(false);
        setInterim('');
        if (finalText) sendLatest.current(finalText);
      },
      onError: setNotice,
    });
    if (!stopListening.current) return setNotice(noListenHelp());
    setListening(true);
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const ok = recognitionAvailable();
      setCanListen(ok);
      setListenHelp(ok ? null : noListenHelp());
      const remembered = rememberedLang();
      const start: VoiceLang | null = remembered === 'hi' && dogriRemembered() ? 'doi' : remembered;
      if (start) setLang(start);
      // Opened from the floating microphone: listen at once (or let them type).
      if (autoListen) {
        if (ok) startListening(start ?? 'en');
        else inputRef.current?.focus();
      }
    });
    // A language saved in My details wins over what this phone remembers.
    void loadAccount()
      .then((a) => {
        if (a?.lang) setLang(a.lang === 'hi' && dogriRemembered() ? 'doi' : a.lang);
        if (a?.district) setDistrict(a.district);
      })
      .catch(() => undefined);
    return () => {
      cancelAnimationFrame(id);
      stopListening.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, thinking, card]);

  // A price question: its answer is read first, then the card.
  useEffect(() => {
    if (!cardAfterAnswer.current || thinking || speaking || !card) return;
    cardAfterAnswer.current = false;
    sayCard(card);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sayCard only reads the card it is given
  }, [thinking, speaking, card]);

  const toggleListening = () => {
    if (listening) {
      stopListening.current?.();
      return;
    }
    startListening(lang);
  };

  const openCard = () => {
    if (!card) return;
    const line = openingLine(card.action, card.lang === 'doi' ? 'hi' : card.lang);
    void say({ text: line.say, lang: card.lang === 'ks' ? 'ks' : cardText(card.lang), speech: line.speech });
    setCard(null);
    onNavigate?.();
    router.push(card.action.href);
  };

  const rtl = isRtl(speechLang) ? 'rtl' : undefined;
  const cl = card ? cardText(card.lang) : 'en';

  return (
    <div
      data-voice-panel={compact ? undefined : ''}
      className={compact ? 'relative p-4 sm:p-5' : 'relative overflow-hidden rounded-[2rem] bg-white/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.14)] ring-1 ring-white/70 backdrop-blur-xl sm:p-8'}
    >
      {!compact && <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-amber-300/50 to-rose-300/40 blur-3xl" />}
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Voice assistant
          </p>
          {compact ? (
            <h2 id="voice-panel-title" className="mt-2 pe-12 text-xl font-semibold tracking-tight text-slate-900">Speak, KashRoot does the rest</h2>
          ) : (
            <>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Ask KashRoot anything</h2>
              <p className="mt-1 text-sm text-slate-600">Prices, weather, crop care and how to use KashRoot — speak, and hear the answer in Kashmiri, Urdu, Hindi, Dogri or English. Say what you want done, and KashRoot fills in the form for you.</p>
            </>
          )}
        </div>
        <LangPicker
          dogri
          value={lang}
          onChange={(l) => {
            setLang(l);
            rememberVoiceLang(l);
          }}
        />
      </div>
      {lang === 'doi' && <p className="relative mt-2 text-xs text-slate-500">Dogri: no browser can hear or speak Dogri yet, so KashRoot listens and answers in Hindi.</p>}
      <RegionChip district={district} className="relative mt-3" />
      {/* The "I am human" check, once an hour, when the assistant or its voice needs it. */}
      <HumanGate className="relative mt-3" />

      {configured === false && (
        <p role="alert" className="relative mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Basic mode: ask about mandi prices, the weather and spraying, or how to use KashRoot. For crop problems, use Ask an expert.
        </p>
      )}

      <div className={`relative grid gap-4 ${compact ? 'mt-4' : 'mt-6 gap-6 md:grid-cols-[auto_1fr] md:items-start'}`}>
        <div className={compact ? 'flex items-center gap-4' : 'flex flex-col items-center gap-3'}>
          <button
            type="button"
            onClick={toggleListening}
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Speak your question'}
            className={`group relative grid shrink-0 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-white shadow-[0_18px_40px_rgba(234,88,12,0.45),inset_0_-8px_20px_rgba(0,0,0,0.2),inset_0_8px_16px_rgba(255,255,255,0.35)] transition hover:scale-105 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-amber-500 motion-reduce:transition-none ${compact ? 'h-20 w-20' : 'h-32 w-32'}`}
          >
            {listening && (
              <>
                <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-orange-400/40 motion-reduce:animate-none" />
                <span aria-hidden className="absolute -inset-3 animate-pulse rounded-full ring-4 ring-orange-300/60 motion-reduce:animate-none" />
              </>
            )}
            {listening ? <MicOff className={`relative ${compact ? 'h-8 w-8' : 'h-10 w-10'}`} aria-hidden /> : <Mic className={`relative ${compact ? 'h-8 w-8' : 'h-10 w-10'}`} aria-hidden />}
          </button>
          <div className={compact ? 'min-w-0' : 'flex flex-col items-center gap-3'}>
            <p className="text-sm font-medium text-slate-600" aria-live="polite">
              {ks ? (
                <span lang="ks">{listening ? t('assistant.listening') : thinking ? t('assistant.thinking') : speaking ? t('assistant.speaking') : canListen ? t('assistant.tap') : t('assistant.placeholder')}</span>
              ) : listening ? 'Listening…' : thinking ? 'Thinking…' : speaking ? 'Speaking…' : canListen ? 'Tap and speak' : 'Type below'}
            </p>
            {ks && canListen && <p lang="ks" dir="rtl" className="max-w-[10rem] text-center text-xs text-slate-500">{t('assistant.speak_hint')}</p>}
            {listenHelp && <p className="max-w-[12rem] text-xs text-amber-800">{listenHelp}</p>}
            {speaking && (
              <button type="button" onClick={stop} className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900/5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-900/10">
                <Square className="h-3.5 w-3.5" aria-hidden /> Stop voice
              </button>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div ref={listRef} className={`${compact ? 'max-h-64' : 'max-h-80'} min-h-[9rem] space-y-3 overflow-y-auto rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-900/5`} aria-live="polite">
            {turns.length === 0 && !interim && !card && (
              <div role="group" aria-label="Try saying" className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s.text} type="button" dir={s.dir ?? rtl} lang={s.dir ? undefined : langAttr(lang)} onClick={() => send(s.text)} className="min-h-11 cursor-pointer rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-900/10 transition hover:bg-amber-50 hover:ring-amber-300">
                    {s.text}
                  </button>
                ))}
              </div>
            )}
            {turns.map((turn, i) => (
              <div key={i} className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}>
                <p
                  dir={isRtl(turn.lang) && (!turn.error || turn.lang === 'ks') ? 'rtl' : undefined}
                  lang={langAttr(turn.lang)}
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${isRtl(turn.lang) ? 'text-[15px]' : 'text-sm'} ${turn.role === 'user' ? 'bg-gradient-to-br from-orange-500 to-rose-600 text-white' : turn.error ? 'bg-rose-50 text-rose-900 ring-1 ring-rose-200' : 'bg-white text-slate-800 ring-1 ring-slate-900/5'}`}
                >
                  {turn.text}
                  {turn.role === 'assistant' && !turn.error && (
                    <button type="button" aria-label="Play this answer" onClick={() => void say(turn)} className="ms-2 inline-flex cursor-pointer align-middle text-slate-400 hover:text-orange-600">
                      <Volume2 className="h-4 w-4" />
                    </button>
                  )}
                </p>
                {turn.role === 'assistant' && turn.from && <ExpertCredit from={turn.from} lang={turn.lang} />}
                {/* Native speakers correct Kashmiri answers; the assistant learns from them. */}
              </div>
            ))}
            {interim && (
              <p dir={rtl} className="ms-auto max-w-[85%] rounded-2xl bg-orange-100 px-4 py-2.5 text-sm italic text-orange-900">
                {interim}
              </p>
            )}
            {thinking && (
              <p className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {ks ? <span lang="ks">{t('assistant.checking')}</span> : 'Checking live data…'}
              </p>
            )}
            {card && (
              <section aria-label="Confirm" className="rounded-2xl bg-white p-4 shadow-sm ring-2 ring-orange-300">
                {!card.action.answer && (
                  <p className="text-xs text-slate-500">
                    You said: <span dir="auto">“{card.said}”</span>
                  </p>
                )}
                <p dir={cl === 'ur' ? 'rtl' : undefined} lang={cl === 'en' ? undefined : cl} className={`mt-1 leading-relaxed text-slate-900 ${cl === 'ur' ? 'text-base' : 'text-[15px]'}`}>
                  {actionSentence(card.action, cl)}
                </p>
                {card.lang === 'ks' && <p className="mt-1 text-xs text-slate-500">Shown in Urdu: KashRoot’s Kashmiri editors have not written this sentence yet.</p>}
                {card.lang === 'doi' && <p className="mt-1 text-xs text-slate-500">Shown in Hindi: there is no Dogri wording yet.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={openCard} className="inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl bg-orange-600 px-5 text-base font-semibold text-white shadow-sm transition hover:bg-orange-700">
                    <Check className="h-5 w-5" aria-hidden /> Open
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCard(null);
                      stop();
                    }}
                    className="inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl bg-white px-4 text-base font-semibold text-slate-800 ring-1 ring-slate-900/15 transition hover:bg-slate-50"
                  >
                    <X className="h-5 w-5" aria-hidden /> Cancel
                  </button>
                  <button type="button" aria-label="Read it again" onClick={() => sayCard(card)} className="inline-grid min-h-12 min-w-12 cursor-pointer place-items-center rounded-xl text-slate-500 hover:bg-orange-50 hover:text-orange-700">
                    <Volume2 className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </section>
            )}
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <label className="sr-only" htmlFor={inputId}>Your question</label>
            <input
              id={inputId}
              ref={inputRef}
              dir={rtl}
              lang={langAttr(lang)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={ks ? t('assistant.placeholder') : PLACEHOLDER[cardText(lang)]}
              className="min-h-12 min-w-0 flex-1 rounded-xl border-0 bg-white px-4 py-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-orange-500"
            />
            {ks && (
              <button type="button" onClick={() => setKeys((v) => !v)} aria-pressed={keys} aria-label="Kashmiri letters" title="Kashmiri letters (ٲ ۄ ؠ …)" className="inline-flex cursor-pointer items-center rounded-xl bg-white px-3 text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-amber-50">
                <Keyboard className="h-5 w-5" aria-hidden />
              </button>
            )}
            <button type="submit" disabled={!draft.trim() || thinking} className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" aria-hidden /> {ks ? <span lang="ks">{t('assistant.ask')}</span> : 'Ask'}
            </button>
          </form>
          {ks && keys && <KashmiriKeys className="mt-2" target={inputRef} value={draft} onChange={setDraft} />}
          {notice && <p role="status" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{notice}</p>}
          <p className="mt-2 text-xs text-slate-500">Prices: Agmarknet (Govt. of India). Weather: Open-Meteo. Crop advice is general — check doses with an agronomist.</p>
        </div>
      </div>
    </div>
  );
}
