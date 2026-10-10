'use client';

/**
 * Video call between a farmer and an expert, on Jitsi Meet (free, no app or
 * account needed for the farmer). Starting a call makes a private room and
 * opens it in a new tab; the link is shared with the expert (WhatsApp or
 * copy) and the expert joins from it — or the expert starts the call and
 * sends the link to the farmer.
 *
 * meet.jit.si asks the first person in a room to sign in (Google/GitHub) to
 * open it, so experts should join first or sign in; farmers just wait in
 * the lobby. Calls open in a tab rather than embedded, because meet.jit.si
 * limits embedded calls.
 */
import { useState } from 'react';
import { Copy, ExternalLink, MessageCircle, Video } from 'lucide-react';
import { toast } from 'sonner';

import { Btn, EmptyState, Field, INPUT, Panel, PORTAL_THEMES } from '@/components/portal/kit';
import { usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.expert;
const TOPICS = ['Apple scab', 'Pests & insects', 'Fertiliser & soil', 'Saffron', 'Walnut & almond', 'Something else'];

interface Call {
  room: string;
  topic: string;
  startedAt: number;
}

const NO_CALLS: Call[] = [];
const roomUrl = (room: string) => `https://meet.jit.si/${room}`;

function newRoom(topic: string) {
  const slug = topic.replace(/[^A-Za-z]+/g, '').slice(0, 16) || 'Consult';
  const random = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  return `KashRoot-${slug}-${random}`;
}

/** Accepts a full meet.jit.si link or just the room code. */
function roomFrom(text: string): string | null {
  const t = text.trim();
  const m = /meet\.jit\.si\/([A-Za-z0-9_-]{6,80})/.exec(t);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{6,80}$/.test(t) ? t : null;
}

export function VideoConsult({ isExpert }: { isExpert: boolean }) {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [calls, setCalls] = usePersistentState<Call[]>('kr_video_calls', NO_CALLS);
  const [joinText, setJoinText] = useState('');
  const latest = calls[0];

  const start = () => {
    const call = { room: newRoom(topic), topic, startedAt: Date.now() };
    setCalls((all) => [call, ...all].slice(0, 10));
    window.open(roomUrl(call.room), '_blank', 'noopener');
  };

  const share = (call: Call) => {
    const text = isExpert
      ? `KashRoot: your video call with an agronomist about ${call.topic}. Tap to join: ${roomUrl(call.room)}`
      : `KashRoot: a farmer needs help with ${call.topic}. Please join the video call: ${roomUrl(call.room)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const copy = async (call: Call) => {
    try {
      await navigator.clipboard.writeText(roomUrl(call.room));
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy — select the link and copy it.');
    }
  };

  const join = () => {
    const room = roomFrom(joinText);
    if (!room) return toast.error('Paste the call link (meet.jit.si/…) or its code.');
    window.open(roomUrl(room), '_blank', 'noopener');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Panel theme={theme} title={isExpert ? 'Start a call with a farmer' : 'Talk to an expert on video'} icon={Video}>
        <p className="text-sm text-slate-600">
          {isExpert
            ? 'Start a call, then send the link to the farmer on WhatsApp. They tap it — no app or account needed.'
            : 'Show the problem on camera to an agronomist from the horticulture department or university. Pick a topic and start — then send the link to the expert.'}
        </p>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-slate-800">What is it about?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <button key={t} type="button" aria-pressed={topic === t} onClick={() => setTopic(t)} className={`cursor-pointer rounded-full px-3.5 py-2 text-sm font-semibold transition ${topic === t ? theme.solid : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
                {t}
              </button>
            ))}
          </div>
        </fieldset>
        <Btn theme={theme} icon={Video} className="mt-5 w-full py-3 text-base" onClick={start}>
          Start video call
        </Btn>
        <p className="mt-3 text-xs text-slate-500">The call opens in a new tab. Allow the camera and microphone when your browser asks.</p>

        {isExpert && (
          <div className="mt-6 border-t border-slate-900/5 pt-5">
            <Field label="Join a farmer's call" hint="Paste the link the farmer sent you, or its code.">
              <div className="flex gap-2">
                <input value={joinText} onChange={(e) => setJoinText(e.target.value)} placeholder="meet.jit.si/KashRoot-…" className={INPUT} />
                <Btn theme={theme} variant="soft" icon={ExternalLink} onClick={join}>Join</Btn>
              </div>
            </Field>
          </div>
        )}
      </Panel>

      <Panel theme={theme} title="Your calls" icon={MessageCircle}>
        {!latest ? (
          <EmptyState theme={theme} icon={Video} title="No calls yet" text="Start a call and its link appears here, ready to send on WhatsApp." />
        ) : (
          <ul className="space-y-3">
            {calls.map((c) => (
              <li key={c.room} className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5">
                <p className="font-semibold text-slate-900">{c.topic}</p>
                <p className="text-xs text-slate-500">{new Date(c.startedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-600">{roomUrl(c.room)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn theme={theme} size="sm" icon={MessageCircle} onClick={() => share(c)}>Send on WhatsApp</Btn>
                  <Btn theme={theme} size="sm" variant="soft" icon={Copy} onClick={() => void copy(c)}>Copy link</Btn>
                  <Btn theme={theme} size="sm" variant="ghost" icon={ExternalLink} onClick={() => window.open(roomUrl(c.room), '_blank', 'noopener')}>Rejoin</Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
