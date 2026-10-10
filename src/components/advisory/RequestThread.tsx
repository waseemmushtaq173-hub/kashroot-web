'use client';

/**
 * One advisory request and its conversation, for the farmer who asked and
 * for experts. Replies can be read aloud; the expert can accept, reply,
 * start a video call and close; the farmer can follow up and join the call.
 * New replies appear by themselves (checked every 8 seconds).
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Phone, Send, Sparkles, UserRound, Video } from 'lucide-react';
import { toast } from 'sonner';

import { VideoCall } from '@/components/advisory/VideoCall';
import { Badge, Btn, INPUT, PORTAL_THEMES } from '@/components/portal/kit';
import { MicButton, SpeakButton } from '@/components/voice/VoiceButtons';
import { isRtl, scriptLang } from '@/lib/client/speech';
import { getRequest, KIND_LABEL, listMessages, sendMessage, setRequest, STATUS_LABEL, type AdvisoryMessage, type AdvisoryRequest } from '@/lib/db/advisory';
import { ago, type Account } from '@/lib/db/client';

const theme = PORTAL_THEMES.expert;

/** AI notes carry a Devanagari copy for a Hindi voice after a marker. */
function splitBody(body: string): { text: string; speech?: string } {
  const [text, speech] = body.split('@@SPEAK@@').map((s) => s.trim());
  return { text, ...(speech ? { speech } : {}) };
}

const STATUS_TONE = { open: 'amber', accepted: 'blue', answered: 'green', closed: 'slate' } as const;

export function RequestThread({ requestId, account, asExpert, onBack }: { requestId: string; account: Account; asExpert: boolean; onBack: () => void }) {
  const [req, setReq] = useState<AdvisoryRequest | null>(null);
  const [messages, setMessages] = useState<AdvisoryMessage[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([getRequest(requestId), listMessages(requestId)]);
      setReq(r);
      setMessages(m);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this request.');
    }
  }, [requestId]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      if (live) await refresh();
    };
    void tick();
    const id = window.setInterval(() => void tick(), 8000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    if (reply.trim().length < 2) return;
    const text = reply.trim();
    void act(async () => {
      await sendMessage(requestId, asExpert ? 'expert' : 'farmer', account.name, text);
      setReply('');
    }, asExpert ? 'Reply sent to the farmer' : 'Message sent');
  };

  if (loadError) return <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{loadError}</p>;
  if (!req) return <p className="flex items-center gap-2 p-6 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;

  const lang = req.lang;
  const callReady = req.kind === 'video_call' && req.status === 'accepted';
  const phoneDigits = (req.farmer_phone ?? '').replace(/\D/g, '').slice(-10);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-purple-800 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All requests
      </button>

      <div className="rounded-3xl bg-white/80 p-5 ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="violet">{KIND_LABEL[req.kind]}</Badge>
          {req.crop && <Badge tone="slate">{req.crop}</Badge>}
          <Badge tone={STATUS_TONE[req.status]}>{STATUS_LABEL[req.status]}</Badge>
          <span className="text-xs text-slate-500">{ago(req.created_at)}</span>
        </div>
        {asExpert && (
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
            <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4" aria-hidden /> {req.farmer_name}{req.district ? ` · ${req.district}` : ''}</span>
            {phoneDigits && (
              <a href={`tel:+91${phoneDigits}`} className="inline-flex items-center gap-1.5 font-semibold text-purple-800">
                <Phone className="h-4 w-4" aria-hidden /> {phoneDigits}
              </a>
            )}
            {req.preferred_time && <span>Preferred time: {req.preferred_time}</span>}
          </p>
        )}
        <p dir={isRtl(lang) ? 'rtl' : undefined} className="mt-3 whitespace-pre-wrap text-slate-900">{req.message}</p>
        {req.photo && (
          // eslint-disable-next-line @next/next/no-img-element -- stored data URL
          <img src={req.photo} alt="Photo from the farmer" className="mt-3 max-h-80 rounded-2xl object-contain ring-1 ring-slate-200" />
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {asExpert && req.status !== 'closed' && !(req.status === 'accepted' && req.expert_id === account.id) && (
            <Btn theme={theme} size="sm" icon={CheckCircle2} disabled={busy} onClick={() => void act(() => setRequest(req.id, 'accept', account.name), req.kind === 'video_call' ? 'Accepted — start the call when ready' : 'Accepted')}>
              {req.kind === 'video_call' ? 'Accept call' : 'Accept'}
            </Btn>
          )}
          {req.kind === 'video_call' && req.status !== 'closed' && (asExpert ? req.status === 'accepted' : callReady) && (
            <Btn theme={theme} size="sm" icon={Video} onClick={() => setInCall(true)}>{asExpert ? 'Start video call' : 'Join video call'}</Btn>
          )}
          {req.status !== 'closed' && (asExpert ? req.expert_id === account.id : true) && (
            <Btn theme={theme} size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => setRequest(req.id, 'close'), 'Request closed')}>Mark as solved</Btn>
          )}
          {!asExpert && req.status === 'closed' && (
            <Btn theme={theme} size="sm" variant="soft" disabled={busy} onClick={() => void act(() => setRequest(req.id, 'reopen'), 'Request reopened')}>Reopen</Btn>
          )}
        </div>
        {!asExpert && req.kind === 'video_call' && req.status === 'open' && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Waiting for an expert to accept. Keep this page open — the “Join video call” button appears here when they do.</p>
        )}
      </div>

      {inCall && (
        <VideoCall
          requestId={req.id}
          me={account.id}
          role={asExpert ? 'expert' : 'farmer'}
          otherName={asExpert ? req.farmer_name : req.expert_name ?? 'Expert'}
          otherPhone={asExpert ? req.farmer_phone : null}
          onClose={() => setInCall(false)}
        />
      )}

      <ol className="space-y-3">
        {messages.map((m) => {
          const { text, speech } = splitBody(m.body);
          const mine = m.sender_id === account.id && m.sender_role !== 'ai';
          return (
            <li key={m.id} className={`rounded-2xl p-4 ring-1 ${m.sender_role === 'ai' ? 'bg-amber-50/80 ring-amber-200' : m.sender_role === 'expert' ? 'bg-purple-50/80 ring-purple-200' : 'bg-white/80 ring-slate-900/5'} ${mine ? 'ml-6' : 'mr-6'}`}>
              <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                {m.sender_role === 'ai' ? <Sparkles className="h-3.5 w-3.5 text-amber-600" aria-hidden /> : <UserRound className="h-3.5 w-3.5" aria-hidden />}
                {m.sender_role === 'ai' ? 'KashRoot AI — first suggestion (an expert will also check)' : m.sender_role === 'expert' ? `Expert · ${m.sender_name ?? 'Agronomist'}` : m.sender_name ?? 'Farmer'}
                <span className="font-normal text-slate-400">{ago(m.created_at)}</span>
              </p>
              <p dir={isRtl(scriptLang(text, lang)) ? 'rtl' : undefined} className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{text}</p>
              {!asExpert && m.sender_role !== 'farmer' && <SpeakButton className="mt-3" text={text} speech={speech} lang={m.sender_role === 'ai' ? lang : scriptLang(text, lang)} label="Listen" />}
            </li>
          );
        })}
        {messages.length === 0 && <li className="text-sm text-slate-500">No replies yet. You will see them here.</li>}
      </ol>

      {req.status !== 'closed' && (asExpert || req.farmer_id === account.id) && (
        <div className="rounded-3xl bg-white/80 p-4 ring-1 ring-slate-900/5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="thread-reply" className="text-sm font-semibold text-slate-800">{asExpert ? 'Your answer to the farmer' : 'Add more details or ask again'}</label>
            <MicButton lang={asExpert ? 'en' : lang} onText={setReply} />
          </div>
          <textarea id="thread-reply" rows={asExpert ? 4 : 3} className={INPUT} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={asExpert ? 'Diagnosis, what to do now, products by type, and when to follow up' : 'Type or tap Speak'} />
          <Btn theme={theme} className="mt-3" icon={Send} disabled={busy || reply.trim().length < 2} onClick={send}>{asExpert ? 'Send answer' : 'Send'}</Btn>
        </div>
      )}
    </div>
  );
}
