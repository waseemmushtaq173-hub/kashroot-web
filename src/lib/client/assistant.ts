'use client';

/**
 * Talking to the KashRoot assistant (/api/ai) from any page: keeps the
 * conversation, reads every reply aloud — and errors too, so someone who
 * cannot read is never left with silence.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { refusedForPass } from '@/lib/client/humanPass';
import { needsDevanagari, NO_VOICE_HELP, speak, stopSpeaking, type SpeechLang } from '@/lib/client/speech';
import { ksText } from '@/lib/kashmiri/phrases';
import { detectReplyLang, rememberLang } from '@/lib/langDetect';
import { navigationFor } from '@/lib/navIntent';
import { currentRegion, regionSpot } from '@/lib/region';

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  lang: SpeechLang;
  /** The reply in Devanagari, for a Hindi voice (Urdu / Kashmiri). */
  speech?: string;
  error?: boolean;
  /** From KashRoot's answer bank: the expert who wrote it, or who checked and approved an AI answer. */
  from?: { name: string; reviewed: boolean };
}

/** Spoken when the assistant can't answer — Kashmiri as the editors wrote it. */
const sorryFor = (lang: SpeechLang): { text: string; speech?: string } =>
  ({
    en: { text: 'Sorry, I cannot answer right now. Please try again in a little while.' },
    hi: { text: 'माफ़ कीजिए, मैं अभी जवाब नहीं दे पा रहा हूँ। थोड़ी देर बाद फिर कोशिश करें।' },
    ur: { text: 'معاف کیجیے، میں ابھی جواب نہیں دے پا رہا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔', speech: 'माफ़ कीजिए, मैं अभी जवाब नहीं दे पा रहा। थोड़ी देर बाद दोबारा कोशिश करें।' },
    ks: { text: ksText('assistant.sorry') },
  })[lang];

const offlineFor = (lang: SpeechLang) => (lang === 'ks' ? ksText('assistant.offline') : 'No internet connection. Please check your mobile data and try again.');

/** Where the person is: the path, with the portal tab that is open (PortalShell marks it). */
function pageNow(): string {
  const tab = document.querySelector('[data-portal-tab]')?.getAttribute('data-portal-tab');
  const url = new URL(window.location.href);
  if (tab) url.searchParams.set('tab', tab);
  return `${url.pathname}${url.search}`;
}

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
    async (text: string, picked: SpeechLang, how: { exact?: boolean } = {}) => {
      const question = text.trim();
      if (!question || thinking) return;
      // Answer in the language they asked in (Urdu script → Urdu, Hindi → Hindi…).
      // (Not for KashRoot's own instructions, e.g. the guide: those keep the chosen language.)
      const lang = how.exact ? picked : detectReplyLang(question, picked);
      if (lang !== picked) rememberLang(lang);
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
      setTurns((all) => [...all, { role: 'user', text: question, lang }]);
      setThinking(true);
      let turn: Turn;
      try {
        const speakAs = (await needsDevanagari(lang)) ? 'hi' : undefined;
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // "My area" for the weather: the phone's location, the district, or the chosen state (lib/region).
          // The page they are on (with its open tab), for "help me here".
          body: JSON.stringify({ query: question, lang, exact: how.exact || undefined, speakAs, path: opts.page ?? pageNow(), where: regionSpot(currentRegion()) ?? undefined }),
        });
        // No "human pass" yet: the check shows in the panel (HumanGate); ask again after it.
        const needsCheck = await refusedForPass(res);
        const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string; speech?: string; from?: { kind?: string; name?: string; reviewed?: boolean } };
        if (needsCheck) data.error = lang === 'hi' ? 'ऊपर “I am human” जाँच पूरी करें, फिर दोबारा पूछें।' : lang === 'ur' || lang === 'ks' ? 'اوپر “I am human” جانچ مکمل کریں، پھر دوبارہ پوچھیں۔' : 'Please complete the “I am human” check above, then ask again.';
        const from = data.from?.kind === 'expert' && data.from.name ? { name: data.from.name, reviewed: Boolean(data.from.reviewed) } : undefined;
        if (data.reply) turn = { role: 'assistant', text: data.reply, lang, speech: data.speech, ...(from ? { from } : {}) };
        else {
          if (res.status === 503) setConfigured(false);
          turn = { role: 'assistant', text: lang === 'ks' ? sorryFor('ks').text : (data.error ?? sorryFor(lang).text), lang, error: true };
        }
      } catch {
        turn = { role: 'assistant', text: offlineFor(lang), lang, error: true };
      } finally {
        setThinking(false);
      }
      setTurns((all) => [...all, turn]);
      // Errors are spoken too, in the person's language.
      void say(turn.error ? { ...sorryFor(lang), lang } : turn);
    },
    [opts.page, router, say, thinking],
  );

  return { turns, ask, thinking, speaking, say, stop, notice, setNotice, configured };
}
