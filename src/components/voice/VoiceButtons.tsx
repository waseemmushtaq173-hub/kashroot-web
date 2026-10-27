'use client';

/**
 * Small voice controls for people who find reading hard:
 *   SpeakButton — reads a text aloud in its language
 *   MicButton   — fills a text box by speaking
 *   LangPicker  — English / Hindi / Urdu / Kashmiri (and Dogri, where asked for)
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2 } from 'lucide-react';

import { isRtl, LANG_LABEL, listen, NO_VOICE_HELP, recognitionAvailable, speak, stopSpeaking, type SpeechLang } from '@/lib/client/speech';

export function SpeakButton({ text, lang, speech, label = 'Listen', className = '', autoPlay = false }: { text: string; lang: SpeechLang; speech?: string; label?: string; className?: string; autoPlay?: boolean }) {
  const [speaking, setSpeaking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const play = async () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setNote(null);
    setSpeaking(true);
    const result = await speak(text, lang, speech, () => setSpeaking(false));
    if (result !== 'spoken') {
      setSpeaking(false);
      setNote(result === 'no-voice' ? NO_VOICE_HELP[lang] : 'This browser cannot read text aloud.');
    }
  };

  const played = useRef(false);
  useEffect(() => {
    if (!autoPlay || played.current) return;
    played.current = true;
    // Speaks once on open (after a tap, so the browser allows sound).
    const id = window.setTimeout(() => void play(), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, [autoPlay]);

  useEffect(() => () => stopSpeaking(), []);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void play()}
        aria-pressed={speaking}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${speaking ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-800 ring-1 ring-orange-200 hover:bg-orange-100'} ${className}`}
      >
        {speaking ? <Square className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        {speaking ? 'Stop' : label}
      </button>
      {note && <span className="text-xs text-slate-500">{note}</span>}
    </span>
  );
}

export function MicButton({ lang, onText, className = '' }: { lang: SpeechLang; onText: (text: string) => void; className?: string }) {
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAvailable(recognitionAvailable()));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!available) return null;

  const toggle = () => {
    if (listening) {
      stop.current?.();
      return;
    }
    setNote(null);
    stop.current = listen(lang, {
      onText: (t) => t && onText(t),
      onDone: () => setListening(false),
      onError: (m) => setNote(m),
    });
    setListening(Boolean(stop.current));
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? 'Stop listening' : 'Speak instead of typing'}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${listening ? 'animate-pulse bg-rose-600 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50'} ${className}`}
      >
        <Mic className="h-4 w-4" aria-hidden /> {listening ? 'Listening… tap to stop' : 'Speak'}
      </button>
      {note && <span className="text-xs text-rose-700">{note}</span>}
      {lang === 'ks' && listening && <span className="text-xs text-slate-500">Speak in Kashmiri or Urdu — phones can’t write Kashmiri speech yet.</span>}
    </span>
  );
}

/**
 * A language of the voice assistant: the four the phone can speak, and Dogri.
 * No browser hears or speaks Dogri, so with Dogri it listens and answers in
 * Hindi (hi-IN) — see `heard`.
 */
export type VoiceLang = SpeechLang | 'doi';
/** The language the phone listens and speaks in. */
export const heard = (l: VoiceLang): SpeechLang => (l === 'doi' ? 'hi' : l);
const LABEL: Record<VoiceLang, string> = { ...LANG_LABEL, doi: 'डोगरी' };

type PickerProps = { className?: string } & ({ dogri?: false; value: SpeechLang; onChange: (l: SpeechLang) => void } | { dogri: true; value: VoiceLang; onChange: (l: VoiceLang) => void });

export function LangPicker(props: PickerProps) {
  const { value, className = '' } = props;
  const langs: VoiceLang[] = props.dogri ? ['ks', 'ur', 'hi', 'doi', 'en'] : ['ks', 'ur', 'hi', 'en'];
  const pick = (l: VoiceLang) => (props.dogri ? props.onChange(l) : l !== 'doi' && props.onChange(l));
  return (
    <div role="group" aria-label="Language" className={`inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 ${className}`}>
      {langs.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === l}
          onClick={() => pick(l)}
          lang={l === 'en' ? undefined : l}
          dir={l !== 'doi' && isRtl(l) ? 'rtl' : undefined}
          className={`min-h-11 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition ${value === l ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
