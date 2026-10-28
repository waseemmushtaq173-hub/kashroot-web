'use client';

/**
 * "On this page": the guide to the portal page and tab the person is on
 * (lib/portalGuide), in big readable words and read aloud by KashRoot's voice
 * as soon as the assistant opens — for someone who cannot read, the guide
 * comes without having to ask. The language buttons switch both the words and
 * the voice. KashRoot's own words: shown at once, with no server.
 */
import { useEffect, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';

import { guideFor, guideIn } from '@/lib/portalGuide';
import { isRtl, LANG_LABEL, speak, stopSpeaking, type SpeechLang } from '@/lib/client/speech';
import { rememberedLang, rememberLang } from '@/lib/langDetect';

const LANGS: SpeechLang[] = ['en', 'hi', 'ur', 'ks'];
// Kashmiri: the Urdu words, its written form (no Kashmiri wording is made up here).
const TITLE: Record<SpeechLang, string> = { en: 'On this page', hi: 'इस पेज पर', ur: 'اس پیج پر', ks: 'اس پیج پر' };
const LISTEN: Record<SpeechLang, string> = { en: 'Listen', hi: 'सुनें', ur: 'سنیں', ks: 'سنیں' };
const STOP: Record<SpeechLang, string> = { en: 'Stop', hi: 'रोकें', ur: 'روکیں', ks: 'روکیں' };
const KS_NOTE = 'Kashmiri is shown in Urdu, its written form, until the Kashmiri guide is ready.';

/** The open tab of the portal page (PortalShell marks it), else the one in the address. */
function openTab(): string | null {
  return document.querySelector('[data-portal-tab]')?.getAttribute('data-portal-tab') || new URLSearchParams(window.location.search).get('tab');
}

export function PageGuide({ path }: { path: string }) {
  const [lang, setLang] = useState<SpeechLang>(() => rememberedLang() ?? 'en');
  const [tab] = useState(() => openTab());
  // Reading starts as soon as the guide opens (below).
  const [speaking, setSpeaking] = useState(true);
  const guide = guideFor(path, tab);
  const text = guide ? guideIn(guide, lang) : '';

  /** Read the guide in `l` (Kashmiri: the Urdu, with the Urdu voice); `speaking` goes off when it ends. */
  const play = (l: SpeechLang) => {
    if (!guide) return;
    void speak(guideIn(guide, l), l === 'ks' ? 'ur' : l, l === 'ur' || l === 'ks' ? guide.hi : undefined, () => setSpeaking(false)).then((r) => {
      if (r !== 'spoken') setSpeaking(false);
    });
  };
  const read = (l: SpeechLang) => {
    setSpeaking(true);
    play(l);
  };

  // Read aloud once when the assistant opens (it opened on a tap, so the phone lets it speak).
  useEffect(() => {
    play(lang);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on opening
  }, []);

  if (!guide) return null;
  return (
    <section aria-labelledby="page-guide-title" data-page-guide className="mx-4 mt-14 rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200 sm:mx-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="page-guide-title" className="text-base font-extrabold text-emerald-950">{TITLE[lang]}</h2>
        <div role="group" aria-label="Language" className="flex flex-wrap gap-1.5">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => {
                setLang(l);
                rememberLang(l);
                read(l);
              }}
              className={`min-h-11 min-w-11 cursor-pointer rounded-xl px-3 text-sm font-bold ring-1 transition ${lang === l ? 'bg-emerald-700 text-white ring-emerald-800' : 'bg-white text-slate-800 ring-slate-900/10 hover:bg-emerald-100'}`}
            >
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      </div>
      <p dir={isRtl(lang) ? 'rtl' : undefined} className="mt-3 text-lg leading-relaxed text-slate-900">
        {text}
      </p>
      {lang === 'ks' && <p className="mt-2 text-xs text-slate-600">{KS_NOTE}</p>}
      <button
        type="button"
        onClick={() => {
          if (speaking) {
            stopSpeaking();
            setSpeaking(false);
          } else read(lang);
        }}
        className="mt-3 inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-emerald-700 px-5 text-base font-bold text-white shadow-sm hover:bg-emerald-800"
      >
        {speaking ? <Square className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
        {speaking ? STOP[lang] : LISTEN[lang]}
      </button>
    </section>
  );
}
