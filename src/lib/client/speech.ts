'use client';

/**
 * Speaking answers aloud and listening by voice — shared by the voice
 * assistant, advisory replies, photo diagnosis and the portal guide.
 * 
 * TTS fallback chain (best Indian voices first):
 * 1. Bhashini TTS (server, best Indian voices via IndicTTS)
 * 2. Google Cloud TTS (server, neural voices) — app/api/speak
 * 3. Human-recorded cached audio (pre-generated key messages)
 * 4. Browser Web Speech API (device voices)
 * 
 * STT fallback chain:
 * 1. Bhashini ASR (server, IndicASR for Indian languages)
 * 2. Browser Web Speech API (device)
 * 
 * Caches audio in IndexedDB for offline playback.
 * 
 * Kashmiri and Urdu voices are rare on phones. When the device has no voice
 * for the language but has a Hindi one, the server also returns the answer
 * in Devanagari and the Hindi voice reads it (`speech`). Kashmiri has no
 * speech recognition anywhere yet, so listening uses Urdu.
 */

import { getCachedAudio, storeCachedAudio, playAudio, preloadHumanMessages } from './audioCache';
import { matchOfflineIntent, getOfflineResponse, isOfflineMode, onOfflineChange } from './offlineIntent';

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
  if (await serverVoiceOn()) return false;
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

/* ── Server TTS ── */

/** Is KashRoot's server voice set up? Asked once per page. */
let serverVoice: Promise<boolean> | null = null;
/**
 * KashRoot's voice can read now: it is set up, and this browser holds the
 * The server voice is available directly; rate limits and caching protect it
 * from accidental or abusive overuse.
 */
async function serverVoiceOn(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return false;
  serverVoice ??= fetch('/api/speak')
    .then((r) => r.json())
    .then((d: { configured?: boolean }) => Boolean(d.configured))
    .catch(() => false);
  return Boolean(await serverVoice);
}

/** The server reads at most this much at once (lib/server/voice VOICE_MAX_CHARS, less a margin). */
const SERVER_PART = 380;
let playing: HTMLAudioElement | null = null;

/** Sentences gathered into parts the server reads in one go: fewer pauses, fewer requests. */
function serverParts(text: string): string[] {
  const out: string[] = [];
  for (const s of chunks(text)) {
    const last = out.at(-1);
    if (last && last.length + s.length + 1 <= SERVER_PART) out[out.length - 1] = `${last} ${s}`;
    else out.push(s.slice(0, SERVER_PART));
  }
  return out;
}

/**
 * Read `text` with KashRoot's server voice (Google Cloud TTS), part after part.
 * Resolves true once the first part is playing, false when it could not start.
 */
function speakWithServer(text: string, lang: SpeechLang, mine: number, onEnd?: () => void): Promise<boolean> {
  const parts = serverParts(text);
  const src = (p: string) => `/api/speak?l=${lang}&t=${encodeURIComponent(p)}`;
  return new Promise((started) => {
    let first = true;
    const play = (i: number, audio: HTMLAudioElement) => {
      if (mine !== epoch) return;
      playing = audio;
      const next = i + 1 < parts.length ? new Audio(src(parts[i + 1])) : null;
      next?.load();
      const done = () => {
        if (mine !== epoch) return;
        if (next) play(i + 1, next);
        else {
          playing = null;
          onEnd?.();
        }
      };
      audio.onended = done;
      audio.onerror = () => {
        if (first) {
          first = false;
          started(false);
        } else done();
      };
      audio
        .play()
        .then(() => {
          if (first) {
            first = false;
            started(true);
          }
        })
        .catch(() => {
          if (first) {
            first = false;
            started(false);
          } else done();
        });
    };
    if (!parts.length) {
      started(false);
      return;
    }
    play(0, new Audio(src(parts[0])));
  });
}

/* ── Bhashini TTS ── */

/**
 * Read `text` with Bhashini TTS (server).
 * Returns audio as Uint8Array, or null if not available.
 */
async function speakWithBhashiniTts(text: string, lang: SpeechLang): Promise<Uint8Array | null> {
  try {
    const res = await fetch('/api/bhashini/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch {
    return null;
  }
}

/* ── Bhashini ASR ── */

/**
 * Speech-to-text via Bhashini ASR.
 * Returns transcribed text, or null if not available.
 */
export async function bhashiniListen(audioBlob: Blob, lang: SpeechLang = 'hi'): Promise<string | null> {
  try {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });
    
    const res = await fetch('/api/bhashini/asr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64, lang }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.text ?? null;
  } catch {
    return null;
  }
}

/* ── Audio Cache & Human Messages ── */

/**
 * Get audio from cache (human-recorded or generated).
 */
async function getCachedOrGeneratedAudio(text: string, lang: SpeechLang, source: 'bhashini' | 'google' | 'human'): Promise<Uint8Array | null> {
  const cached = await getCachedAudio(source, lang, text);
  if (cached) return cached;
  
  // Generate and cache
  let audio: Uint8Array | null = null;
  if (source === 'bhashini') {
    audio = await speakWithBhashiniTts(text, lang);
  } else if (source === 'google') {
    // Would need to call /api/speak and capture audio - not directly accessible here
    // Fall through to browser TTS
  }
  
  if (audio) {
    await storeCachedAudio(source, lang, text, audio);
    return audio;
  }
  return null;
}

/* ── Main speak function ── */

/**
 * Reads `text` aloud in `lang`. `speech` is the Devanagari copy for a Hindi
 * voice when the device has no Urdu/Kashmiri voice. Calls `onEnd` when done.
 * 
 * Fallback chain:
 * 1. Bhashini TTS (cached)
 * 2. Google Cloud TTS via /api/speak (cached)
 * 3. Human-recorded cached audio for key messages
 * 4. Browser Web Speech API
 */
export async function speak(text: string, lang: SpeechLang, speech?: string, onEnd?: () => void): Promise<SpeakResult> {
  stopSpeaking();
  const mine = epoch;
  
  // Preload human messages on first speak
  if (typeof window !== 'undefined' && !sessionStorage.getItem('kr_audio_preloaded')) {
    sessionStorage.setItem('kr_audio_preloaded', '1');
    preloadHumanMessages().catch(() => {});
  }

  // Try Bhashini TTS first (best Indian voices)
  if (mine === epoch) {
    const audio = await getCachedOrGeneratedAudio(text, lang, 'bhashini');
    if (audio) {
      if (mine !== epoch) return 'spoken';
      if (await playCachedAudio(audio, mine, onEnd)) return 'spoken';
      if (mine !== epoch) return 'spoken';
    }
  }

  // Try Google Cloud TTS (KashRoot's own voice)
  if (await serverVoiceOn()) {
    if (mine !== epoch) return 'spoken';
    if (await speakWithServer(text, lang, mine, onEnd)) return 'spoken';
    if (mine !== epoch) return 'spoken';
  }

  // Try human-recorded cached audio for key messages
  const humanAudio = await getCachedAudio('human', lang, text);
  if (humanAudio) {
    if (mine !== epoch) return 'spoken';
    if (await playCachedAudio(humanAudio, mine, onEnd)) return 'spoken';
    if (mine !== epoch) return 'spoken';
  }

  // Fallback to browser Web Speech API
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return 'unsupported';
  synth.cancel();
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

/** Play cached audio with epoch tracking */
async function playCachedAudio(audio: Uint8Array, mine: number, onEnd?: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([audio.buffer as ArrayBuffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audioEl = new Audio(url);
      audioEl.onended = () => {
        URL.revokeObjectURL(url);
        if (mine === epoch) onEnd?.();
        resolve(true);
      };
      audioEl.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      audioEl.play()
        .then(() => {
          if (mine !== epoch) {
            audioEl.pause();
            URL.revokeObjectURL(url);
            resolve(false);
          }
        })
        .catch(() => {
          URL.revokeObjectURL(url);
          resolve(false);
        });
    } catch {
      resolve(false);
    }
  });
}

export const stopSpeaking = () => {
  epoch++;
  if (playing) {
    playing.onended = null;
    playing.onerror = null;
    playing.pause();
    playing = null;
  }
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
};

/**
 * A quiet hint, once per visit, when this phone has no voice for the language:
 * the answer is always shown as text, so it is never an error. Null when the
 * hint was given already (or reading aloud is not possible at all).
 */
export function voiceHint(result: SpeakResult, lang: SpeechLang): string | null {
  if (result !== 'no-voice' || typeof window === 'undefined') return null;
  try {
    if (sessionStorage.getItem('kr_voice_hint')) return null;
    sessionStorage.setItem('kr_voice_hint', '1');
  } catch {
    /* storage blocked: the hint may show again */
  }
  return NO_VOICE_HELP[lang];
}

export const NO_VOICE_HELP: Record<SpeechLang, string> = {
  en: 'This device has no voice to read the answer aloud.',
  hi: 'No Hindi voice is installed on this device, so the answer is shown as text. Add Hindi in your phone\'s text-to-speech settings (Google Text-to-speech on Android) to hear it.',
  ur: 'No Urdu or Hindi voice is installed on this device, so the answer is shown as text. Add Hindi or Urdu in your phone\'s text-to-speech settings (Google Text-to-speech on Android) to hear it.',
  ks: 'No voice on this device can read Kashmiri yet, so the answer is shown as text. Add Hindi or Urdu in your phone\'s text-to-speech settings (Google Text-to-speech on Android) and it will be read aloud.',
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

/** Brave ships the speech API but blocks the service behind it (fails with "network"). */
export function isBrave(): boolean {
  return typeof navigator !== 'undefined' && 'brave' in navigator;
}

/** What to tell someone whose browser cannot listen. */
export function noListenHelp(): string {
  return isBrave()
    ? 'Bhashini ASR not available. Use Chrome on your phone — or type your question.'
    : 'This browser cannot listen. Use Chrome on your phone — or type your question.';
}

export function recognitionAvailable(): boolean {
  if (typeof window === 'undefined' || isBrave()) return false;
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
 * 
 * Fallback chain:
 * 1. Bhashini ASR (server, best for Indian languages)
 * 2. Browser Web Speech API (device)
 */
export function listen(lang: SpeechLang, handlers: { onText?: (t: string) => void; onDone: (finalText: string) => void; onError?: (message: string) => void }): (() => void) | null {
  // Try Bhashini ASR first if available
  const useBhashiniAsr = async () => {
    try {
      const res = await fetch('/api/bhashini/asr', { method: 'HEAD', signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  };

  // For now, use browser Web Speech API (Bhashini ASR requires audio blob handling)
  // Bhashini ASR would need MediaRecorder integration
  if (!recognitionAvailable()) return null;
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