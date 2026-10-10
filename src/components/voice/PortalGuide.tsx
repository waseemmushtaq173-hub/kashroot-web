'use client';

/**
 * A spoken guide in every portal, for people who cannot read well. A round
 * "Help · मदद · مدد" button opens it; it opens by itself the first time
 * someone enters a portal. It reads out what the page is for and which
 * buttons to press — in Kashmiri (via the AI), Urdu, Hindi or English — and
 * answers "how do I…?" questions spoken by voice, knowing which page they
 * are on.
 */
import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Loader2, Mic, Square, Volume2, X } from 'lucide-react';

import { PORTAL_GUIDES } from '@/components/voice/portalGuides';
import { LangPicker } from '@/components/voice/VoiceButtons';
import { useAssistant } from '@/lib/client/assistant';
import { isRtl, listen, NO_VOICE_HELP, speak, stopSpeaking, type SpeechLang } from '@/lib/client/speech';
import { PORTALS, type PortalId } from '@/lib/auth/roles';
import { loadAccount } from '@/lib/db/client';

export function PortalGuide({ portal }: { portal: PortalId }) {
  const guide = PORTAL_GUIDES[portal];
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<SpeechLang>('en');
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const page = `${PORTALS[portal].label} portal. ${guide?.en ?? ''}`;
  const { turns, ask, thinking, speaking, say, stop, configured } = useAssistant({ page });
  const stopListening = useRef<(() => void) | null>(null);
  const autoOpened = useRef(false);
  const autoRead = useRef<number | null>(null);
  /** The person chose something themselves: drop the pending automatic reading. */
  const cancelAutoRead = () => {
    if (autoRead.current !== null) window.clearTimeout(autoRead.current);
    autoRead.current = null;
  };

  const readGuide = async (l: SpeechLang = lang) => {
    if (!guide) return;
    stop();
    setNote(null);
    let say: SpeechLang = l;
    if (l === 'ks') {
      const ai = configured ?? (await fetch('/api/ai').then((r) => r.json()).then((d) => Boolean(d.configured)).catch(() => true));
      if (ai) {
        // Kashmiri: the AI explains the page in Kashmiri, then it is read aloud.
        await ask('Explain this page to me simply, step by step: what is it for and which buttons do I press?', 'ks');
        return;
      }
      // No AI yet: Urdu is the closest written guide a Kashmiri speaker follows.
      say = 'ur';
      setNote('Kashmiri needs the AI assistant, which is not connected yet — reading the guide in Urdu.');
    }
    setReading(true);
    const text = say === 'hi' ? guide.hi : say === 'ur' ? guide.ur : guide.en;
    const result = await speak(text, say, say === 'ur' ? guide.hi : undefined, () => setReading(false));
    if (result !== 'spoken') {
      setReading(false);
      setNote(result === 'no-voice' ? NO_VOICE_HELP[say] : 'This browser cannot read aloud.');
    }
  };

  // Once the person starts using the page itself (not a window that opened
  // by itself), the guide must not pop up or stay over what they are doing.
  const busy = useRef(false);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t && !t.closest('dialog, #portal-guide, [aria-controls="portal-guide"]')) {
        busy.current = true;
        // Tapping the page tucks the guide away (it keeps talking); Help reopens it.
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

  // First visit to this portal on this phone: open the guide and read it.
  useEffect(() => {
    if (!guide || autoOpened.current) return;
    autoOpened.current = true;
    const key = `kr_guide_seen_${portal}`;
    let seen = false;
    try {
      seen = localStorage.getItem(key) === '1';
    } catch {
      /* storage blocked */
    }
    void loadAccount()
      .catch(() => null)
      .then((a) => {
        const l = a?.lang ?? 'en';
        setLang(l);
        if (seen) return;
        // Wait until any other window (e.g. the identity check) is closed,
        // so only one thing talks to the farmer at a time — but give up if
        // they have already started on the page; the Help button stays.
        const until = Date.now() + 60_000;
        const show = () => {
          if (busy.current || Date.now() > until) return;
          if (document.querySelector('dialog[open]')) return void window.setTimeout(show, 1000);
          try {
            localStorage.setItem(key, '1');
          } catch {
            /* storage blocked */
          }
          setOpen(true);
          // Browsers allow speech right after a tap (sign-in, or closing that window).
          autoRead.current = window.setTimeout(() => {
            autoRead.current = null;
            void readGuide(l);
          }, 600);
        };
        show();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per portal
  }, [portal]);

  const askByVoice = () => {
    cancelAutoRead();
    if (listening) {
      stopListening.current?.();
      return;
    }
    stopSpeaking();
    setReading(false);
    setNote(null);
    stopListening.current = listen(lang, {
      onText: setHeard,
      onDone: (t) => {
        setListening(false);
        setHeard('');
        if (t) void ask(t, lang);
      },
      onError: setNote,
    });
    if (!stopListening.current) return setNote('This browser cannot listen. Use Chrome on your phone.');
    setListening(true);
  };

  if (!guide) return null;
  const last = [...turns].reverse().find((t) => t.role === 'assistant');
  const shownText = lang === 'hi' ? guide.hi : lang === 'ur' || (lang === 'ks' && configured === false) ? guide.ur : lang === 'en' ? guide.en : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="portal-guide"
        className="fixed bottom-4 right-4 z-40 inline-flex cursor-pointer items-center gap-2 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 px-4 py-3 text-sm font-bold text-white shadow-[0_12px_30px_rgba(234,88,12,0.45)] hover:from-amber-600 hover:to-orange-700 sm:bottom-6 sm:right-6"
      >
        <HelpCircle className="h-5 w-5" aria-hidden /> Help · मदद · مدد
      </button>

      {open && (
        <section id="portal-guide" aria-label="Help for this page" className="fixed inset-x-3 bottom-20 z-40 max-h-[75svh] overflow-y-auto rounded-3xl bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/10 sm:inset-x-auto sm:right-6 sm:w-[26rem]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-lg font-semibold text-slate-900">How to use this page</p>
            <button type="button" aria-label="Close help" onClick={() => { cancelAutoRead(); stop(); stopSpeaking(); setOpen(false); }} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <LangPicker className="mt-3" value={lang} onChange={(l) => { cancelAutoRead(); setLang(l); stop(); stopSpeaking(); setReading(false); }} />

          <button
            type="button"
            onClick={() => {
              cancelAutoRead();
              if (reading || speaking) {
                stop();
                stopSpeaking();
                setReading(false);
              } else void readGuide();
            }}
            className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-orange-600 px-4 py-4 text-base font-bold text-white hover:bg-orange-700"
          >
            {reading || speaking ? <Square className="h-5 w-5" aria-hidden /> : thinking ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
            {reading || speaking ? 'Stop' : thinking ? 'One moment…' : 'Listen to the guide'}
          </button>
          {shownText && <p dir={isRtl(lang) ? 'rtl' : undefined} className="mt-3 text-sm leading-relaxed text-slate-700">{shownText}</p>}

          <div className="mt-4 border-t border-slate-900/5 pt-4">
            <p className="text-sm font-semibold text-slate-800">Ask how to do something</p>
            <button
              type="button"
              onClick={askByVoice}
              aria-pressed={listening}
              className={`mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold ${listening ? 'animate-pulse bg-rose-600 text-white' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100'}`}
            >
              <Mic className="h-5 w-5" aria-hidden /> {listening ? 'Listening… tap to stop' : 'Tap and speak your question'}
            </button>
            {lang === 'ks' && <p className="mt-1 text-xs text-slate-500">Speak in Kashmiri or Urdu.</p>}
            {heard && <p dir={isRtl(lang) ? 'rtl' : undefined} className="mt-2 text-sm italic text-slate-600">{heard}</p>}
            {thinking && <p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Thinking…</p>}
            {last && (
              <div className={`mt-3 rounded-2xl p-3 text-sm ${last.error ? 'bg-rose-50 text-rose-900' : 'bg-slate-50 text-slate-800'}`}>
                <p dir={isRtl(last.lang) && !last.error ? 'rtl' : undefined}>{last.text}</p>
                {!last.error && (
                  <button type="button" onClick={() => void say(last)} className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-orange-700">
                    <Volume2 className="h-4 w-4" aria-hidden /> Listen again
                  </button>
                )}
              </div>
            )}
            {configured === false && <p className="mt-2 text-xs text-amber-800">Questions need the AI assistant, which the site owner has not connected yet. The guide above still works.</p>}
            {note && <p role="status" className="mt-2 text-xs text-amber-800">{note}</p>}
          </div>
        </section>
      )}
    </>
  );
}
