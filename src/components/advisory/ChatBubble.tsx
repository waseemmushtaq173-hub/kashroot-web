'use client';

/**
 * One message of the expert conversation, as a chat bubble: the person's own messages on the right in green, the
 * farmer's, the expert's (verified) and the AI's suggestions on the left, each with a round avatar. Replies from others
 * can be read aloud (Listen) for people who find reading hard.
 */
import { Sparkles } from 'lucide-react';

import { initialsOf } from '@/components/layout/portal/look';
import { SpeakButton } from '@/components/voice/VoiceButtons';
import { isRtl, scriptLang } from '@/lib/client/speech';
import type { AdvisoryMessage, AdvisoryRequest } from '@/lib/db/advisory';
import { ago } from '@/lib/db/client';

/** AI notes carry a Devanagari copy for a Hindi voice after a marker. */
export function splitBody(body: string): { text: string; speech?: string } {
  const [text, speech] = body.split('@@SPEAK@@').map((s) => s.trim());
  return { text, ...(speech ? { speech } : {}) };
}

export function ChatBubble({ message: m, mine, asExpert, lang }: { message: AdvisoryMessage; mine: boolean; asExpert: boolean; lang: AdvisoryRequest['lang'] }) {
  const { text, speech } = splitBody(m.body);
  const ai = m.sender_role === 'ai';
  const expert = m.sender_role === 'expert';
  const who = ai ? 'AI Agronomic Suggestion' : m.sender_name ?? (expert ? 'Agronomist' : 'Farmer');
  return (
    <li className={`flex items-end gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
      <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ring-2 ring-white ${ai ? 'bg-amber-500' : expert ? 'bg-forest' : mine ? 'bg-forest-deep' : 'bg-slate-500'}`}>
        {ai ? <Sparkles className="h-5 w-5" /> : initialsOf(who)}
      </span>
      <div
        data-kr-plain
        className={`min-w-0 max-w-[85%] rounded-3xl px-4 py-3 shadow-sm ring-1 ${
          mine
            ? 'rounded-br-md bg-forest text-white ring-forest-deep'
            : ai
              ? 'rounded-bl-md bg-amber-50 text-slate-900 ring-amber-200'
              : expert
                ? 'rounded-bl-md bg-forest-soft text-slate-900 ring-forest-line'
                : 'rounded-bl-md bg-white text-slate-900 ring-slate-900/10'
        }`}
      >
        <p className={`flex flex-wrap items-center gap-x-2 text-xs font-semibold ${mine ? 'text-white/85' : 'text-slate-600'}`}>
          {ai ? '🤖 AI Agronomic Suggestion — verify doses with an agronomist' : expert ? `✅ Verified expert advisory · ${who}` : who}
          <span className={`font-normal ${mine ? 'text-white/70' : 'text-slate-500'}`}>{ago(m.created_at)}</span>
        </p>
        <p dir={isRtl(scriptLang(text, lang)) ? 'rtl' : undefined} className="mt-1.5 whitespace-pre-wrap text-sm">
          {text}
        </p>
        {!asExpert && m.sender_role !== 'farmer' && <SpeakButton className="mt-3" text={text} speech={speech} lang={ai ? lang : scriptLang(text, lang)} label="Listen" />}
      </div>
    </li>
  );
}
