'use client';

/**
 * Talking to the KashRoot assistant (/api/ai) from any page: keeps the
 * conversation, reads every reply aloud — and errors too, so someone who
 * cannot read is never left with silence.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { needsDevanagari, NO_VOICE_HELP, speak, stopSpeaking, type SpeechLang } from '@/lib/client/speech';
import { navigationFor } from '@/lib/navIntent';

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  lang: SpeechLang;
  /** The reply in Devanagari, for a Hindi voice (Urdu / Kashmiri). */
  speech?: string;
  error?: boolean;
}

/** Spoken when the assistant can't answer (Urdu also serves Kashmiri). */
const SORRY: Record<SpeechLang, { text: string; speech?: string }> = {
  en: { text: 'Sorry, I cannot answer right now. Please try again in a little while.' },
  hi: { text: 'माफ़ कीजिए, मैं अभी जवाब नहीं दे पा रहा हूँ। थोड़ी देर बाद फिर कोशिश करें।' },
  ur: { text: 'معاف کیجیے، میں ابھی جواب نہیں دے پا رہا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔', speech: 'माफ़ कीजिए, मैं अभी जवाब नहीं दे पा रहा। थोड़ी देर बाद दोबारा कोशिश करें।' },
  ks: { text: 'معاف کیجیے، میں ابھی جواب نہیں دے پا رہا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔', speech: 'माफ़ कीजिए, मैं अभी जवाब नहीं दे पा रहा। थोड़ी देर बाद दोबारा कोशिश करें।' },
};

export function useAssistant(opts: { page?: string } = {}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** null until checked; false when the site has no AI key yet. */
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/ai')
      .then((r) => r.json())
      .then((d) => live && setConfigured(Boolean(d.configured)))
      .catch(() => live && setConfigured(null));
    return () => {
      live = false;
      stopSpeaking();
    };
  }, []);

  const say = useCallback(async (turn: Pick<Turn, 'text' | 'lang' | 'speech'>) => {
    setSpeaking(true);
    const result = await speak(turn.text, turn.lang, turn.speech, () => setSpeaking(false));
    if (result !== 'spoken') {
      setSpeaking(false);
      setNotice(result === 'no-voice' ? NO_VOICE_HELP[turn.lang] : 'This browser cannot read answers aloud.');
    }
  }, []);

  const stop = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);

  const ask = useCallback(
    async (text: string, lang: SpeechLang) => {
      const question = text.trim();
      if (!question || thinking) return;
      setNotice(null);
      // "Open cold storage", "मंडी दिखाओ": act at once, on the phone — no server, no AI.
      const nav = navigationFor(question, lang);
      if (nav) {
        const done: Turn = { role: 'assistant', text: nav.say, lang, speech: nav.speech };
        setTurns((all) => [...all, { role: 'user', text: question, lang }, done]);
        void say(done);
        router.push(nav.href);
        return;
      }
      const history = turns.filter((t) => !t.error).slice(-6).map(({ role, text: t }) => ({ role, text: t }));
      setTurns((all) => [...all, { role: 'user', text: question, lang }]);
      setThinking(true);
      let turn: Turn;
      try {
        const speakAs = (await needsDevanagari(lang)) ? 'hi' : undefined;
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: question, lang, history, speakAs, page: opts.page }),
        });
        const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string; speech?: string };
        if (data.reply) turn = { role: 'assistant', text: data.reply, lang, speech: data.speech };
        else {
          if (res.status === 503) setConfigured(false);
          turn = { role: 'assistant', text: data.error ?? SORRY[lang].text, lang, error: true };
        }
      } catch {
        turn = { role: 'assistant', text: 'No internet connection. Please check your mobile data and try again.', lang, error: true };
      } finally {
        setThinking(false);
      }
      setTurns((all) => [...all, turn]);
      // Errors are spoken too, in the person's language.
      void say(turn.error ? { ...SORRY[lang], lang } : turn);
    },
    [opts.page, router, say, thinking, turns],
  );

  return { turns, ask, thinking, speaking, say, stop, notice, setNotice, configured };
}
