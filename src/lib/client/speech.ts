'use client';

/**
 * Speaking answers aloud and listening by voice, with the browser's Web
 * Speech API — shared by the voice assistant, advisory replies, photo
 * diagnosis and the portal guide.
 *
 * Kashmiri and Urdu voices are rare on phones. When the device has no voice
 * for the language but has a Hindi one, the server also returns the answer
 * in Devanagari and the Hindi voice reads it (`speech`). Kashmiri has no
 * speech recognition anywhere yet, so listening uses Urdu.
 */
export type SpeechLang = 'en' | 'hi' | 'ur' | 'ks';

export const VOICE_CODE: Record<SpeechLang, string> = { en: 'en-IN', hi: 'hi-IN', ur: 'ur-IN', ks: 'ks-IN' };
/** Recognition: no browser recognises Kashmiri, so listen in Urdu. */
export const LISTEN_CODE: Record<SpeechLang, string> = { en: 'en-IN', hi: 'hi-IN', ur: 'ur-IN', ks: 'ur-IN' };

export const LANG_LABEL: Record<SpeechLang, string> = { en: 'English', hi: 'हिन्दी', ur: 'اردو', ks: 'کٲشُر' };
export const isRtl = (lang: SpeechLang) => lang === 'ur' || lang === 'ks';

/** The farmer's saved "Language you prefer" (My details) as a code. */
export function langFromPreference(pref: unknown): SpeechLang | null {
  const p = String(pref ?? '').toLowerCase();
  if (p.startsWith('kashmiri')) return 'ks';
  if (p.startsWith('urdu')) return 'ur';
  if (p.startsWith('hindi')) return 'hi';
  if (p.startsWith('english')) return 'en';
  return null;
}

const NATURAL = /natural|neural|online|google|premium|enhanced|siri/i;

export function bestVoice(voices: SpeechSynthesisVoice[], code: string): SpeechSynthesisVoice | undefined {
  const prefix = code.slice(0, 2).toLowerCase();
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  const matching = voices.filter((v) => norm(v).startsWith(prefix));
  const exact = matching.filter((v) => norm(v) === code.toLowerCase());
  return exact.find((v) => NATURAL.test(v.name)) ?? matching.find((v) => NATURAL.test(v.name)) ?? exact[0] ?? matching[0];
}

/** Voices load asynchronously in Chrome; wait briefly for them. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return Promise.resolve([]);
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}

/** True when the answer should also come back in Devanagari for a Hindi voice. */
export async function needsDevanagari(lang: SpeechLang): Promise<boolean> {
  if (lang !== 'ur' && lang !== 'ks') return false;
  const voices = await loadVoices();
  return !bestVoice(voices, VOICE_CODE[lang]) && Boolean(bestVoice(voices, 'hi-IN'));
}

/** Short sentences: Chrome's online voices stop after ~14 s of one utterance. */
function chunks(text: string): string[] {
  return (text.match(/[^.!?।۔؟\n]+[.!?।۔؟]?/g) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => (s.length > 180 ? s.match(/.{1,180}(\s|$)/g) ?? [s] : [s]));
}

export type SpeakResult = 'spoken' | 'no-voice' | 'unsupported';

/** Bumped by every speak / stop, so a reading that was waiting for the
 * phone's voices does not start after something newer replaced it. */
let epoch = 0;

/**
 * Reads `text` aloud in `lang`. `speech` is the Devanagari copy for a Hindi
 * voice when the device has no Urdu/Kashmiri voice. Calls `onEnd` when done.
 */
export async function speak(text: string, lang: SpeechLang, speech?: string, onEnd?: () => void): Promise<SpeakResult> {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return 'unsupported';
  synth.cancel();
  const mine = ++epoch;
  const voices = await loadVoices();
  if (mine !== epoch) {
    onEnd?.();
    return 'spoken';
  }
  let code = VOICE_CODE[lang];
  let say = text;
  let voice = bestVoice(voices, code);
  if (!voice && (lang === 'ur' || lang === 'ks')) {
    const hindi = bestVoice(voices, 'hi-IN');
    if (hindi && speech) {
      voice = hindi;
      code = 'hi-IN';
      say = speech;
    } else if (lang === 'ks') {
      // Kashmiri text with an Urdu voice is still better than silence.
      const urdu = bestVoice(voices, 'ur-IN');
      if (urdu) {
        voice = urdu;
        code = 'ur-IN';
      }
    }
  }
  if (!voice && lang !== 'en') return 'no-voice';
  const parts = chunks(say);
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = voice?.lang ?? code;
    if (voice) u.voice = voice;
    u.rate = 0.92;
    if (i === parts.length - 1) {
      u.onend = () => onEnd?.();
      u.onerror = () => onEnd?.();
    }
    synth.speak(u);
  });
  return 'spoken';
}

export const stopSpeaking = () => {
  epoch++;
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
};

export const NO_VOICE_HELP: Record<SpeechLang, string> = {
  en: 'This device has no voice to read the answer aloud.',
  hi: 'No Hindi voice is installed on this device, so the answer is shown as text. Add Hindi in your phone’s text-to-speech settings (Google Text-to-speech on Android) to hear it.',
  ur: 'No Urdu or Hindi voice is installed on this device, so the answer is shown as text. Add Hindi or Urdu in your phone’s text-to-speech settings (Google Text-to-speech on Android) to hear it.',
  ks: 'No voice on this device can read Kashmiri yet, so the answer is shown as text. Add Hindi or Urdu in your phone’s text-to-speech settings (Google Text-to-speech on Android) and it will be read aloud.',
};

/* ── listening ── */

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

export function recognitionAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export const LISTEN_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone permission was blocked. Allow the microphone for this site and try again.',
  'no-speech': 'I did not hear anything. Tap the microphone and speak.',
  'language-not-supported': 'This browser cannot listen in that language yet — please type instead.',
  network: 'Voice input could not connect. Some browsers, such as Brave, block it — use Chrome, or type instead.',
  'service-not-allowed': 'This browser does not allow voice input. Use Chrome, or type instead.',
};

/**
 * Starts listening; `onText` gets the running transcript, `onDone` the final
 * text (empty when nothing was heard). Returns a stop function, or null when
 * the browser can't listen.
 */
export function listen(lang: SpeechLang, handlers: { onText?: (t: string) => void; onDone: (finalText: string) => void; onError?: (message: string) => void }): (() => void) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  stopSpeaking();
  const rec = new Ctor();
  rec.lang = LISTEN_CODE[lang];
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onresult = (e) => {
    let live = '';
    finalText = '';
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else live += r[0].transcript;
    }
    handlers.onText?.(finalText + live);
  };
  rec.onerror = (e) => handlers.onError?.(LISTEN_ERRORS[e.error] ?? 'Voice input stopped. Please try again.');
  rec.onend = () => handlers.onDone(finalText.trim());
  rec.start();
  return () => rec.stop();
}

/** The language to read a text in, from its script (Urdu/Kashmiri script, Devanagari or Latin). */
export function scriptLang(text: string, preferred: SpeechLang): SpeechLang {
  if (/[؀-ۿ]/.test(text)) return preferred === 'ks' ? 'ks' : 'ur';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  return 'en';
}
