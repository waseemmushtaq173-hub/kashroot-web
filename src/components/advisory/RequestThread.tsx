'use client';

/**
 * One advisory request and its conversation, for the farmer who asked and
 * for experts. Replies can be read aloud; the expert can accept, reply,
 * start a video call and close; the farmer can follow up, join the call and
 * say whether the answer helped (which accepts the expert's work for pay).
 * New replies appear by themselves (checked every 8 seconds).
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Phone, Send, ThumbsDown, ThumbsUp, UserRound, Video } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { VideoCall } from '@/components/advisory/VideoCall';
import { ChatBubble } from '@/components/advisory/ChatBubble';
import { addQuickReply, quickRepliesFor } from '@/components/advisory/quickReplies';
import { LabReportView } from '@/components/lab/LabReportView';
import { Badge, Btn, INPUT, PORTAL_THEMES, Skeleton } from '@/components/portal/kit';
import { MicButton } from '@/components/voice/VoiceButtons';
import { isRtl } from '@/lib/client/speech';
import { getRequest, KIND_LABEL, labBookingOf, listMessages, sendMessage, setRequest, STATUS_LABEL, type AdvisoryMessage, type AdvisoryRequest } from '@/lib/db/advisory';
import { ago, type Account } from '@/lib/db/client';
import { adviceRating, rateAdvice } from '@/lib/db/contributions';

const theme = PORTAL_THEMES.expert;

const STATUS_TONE = { open: 'amber', accepted: 'blue', answered: 'green', closed: 'slate' } as const;

export function RequestThread({ requestId, account, asExpert, onBack }: { requestId: string; account: Account; asExpert: boolean; onBack: () => void }) {
  const [req, setReq] = useState<AdvisoryRequest | null>(null);
  const [messages, setMessages] = useState<AdvisoryMessage[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rating, setRating] = useState<'helpful' | 'not_helpful' | null | undefined>(undefined);
  // A question about a lab report carries the booking whose report is shown under it.
  const [labBooking, setLabBooking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [r, m, rated, lab] = await Promise.all([getRequest(requestId), listMessages(requestId), asExpert ? Promise.resolve(undefined) : adviceRating(requestId), labBookingOf(requestId)]);
      setLabBooking(lab);
      setReq(r);
      setMessages(m);
      setRating(rated);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this request.');
    }
  }, [requestId, asExpert]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      // Background tabs do not poll — refresh the moment the page is seen again.
      if (!live || document.visibilityState !== 'visible') return;
      await refresh();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    void tick();
    const id = window.setInterval(() => void tick(), 8000);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
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
  if (!req) return <div className="p-6"><Skeleton label="Loading…" /></div>;

  const lang = req.lang;
  const callReady = req.kind === 'video_call' && req.status === 'accepted';
  const phoneDigits = (req.farmer_phone ?? '').replace(/\D/g, '').slice(-10);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-forest-deep hover:underline">
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
              <a href={`tel:+91${phoneDigits}`} className="inline-flex items-center gap-1.5 font-semibold text-forest-deep">
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
        {labBooking && (
          <details className="mt-3 rounded-2xl bg-forest-soft p-3 ring-1 ring-forest-line" open={asExpert}>
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-forest-deep">Lab report attached to this question</summary>
            <div className="mt-2 rounded-xl bg-white p-3"><LabReportView bookingId={labBooking} /></div>
          </details>
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

      {/* The conversation as chat: the person's own messages on the right in green, the others on the left. */}
      <ol className="space-y-4" aria-label="Conversation">
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} mine={m.sender_id === account.id && m.sender_role !== 'ai'} asExpert={asExpert} lang={lang} />
        ))}
        {messages.length === 0 && <li className="text-sm text-slate-500">No replies yet. You will see them here.</li>}
      </ol>

      {!asExpert && req.farmer_id === account.id && rating !== undefined && messages.some((m) => m.sender_role === 'expert') && (
        <div className="rounded-3xl bg-white/80 p-4 ring-1 ring-slate-900/5">
          <p className="text-sm font-semibold text-slate-800">Did the expert’s answer help you?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn theme={theme} size="sm" variant={rating === 'helpful' ? 'solid' : 'soft'} icon={ThumbsUp} aria-pressed={rating === 'helpful'} disabled={busy} onClick={() => void act(() => rateAdvice(req.id, true), 'Thank you — the expert will be told')}>Yes, it helped</Btn>
            <Btn theme={theme} size="sm" variant={rating === 'not_helpful' ? 'danger' : 'ghost'} icon={ThumbsDown} aria-pressed={rating === 'not_helpful'} disabled={busy} onClick={() => void act(() => rateAdvice(req.id, false), 'Thank you — KashRoot will look at it')}>No</Btn>
          </div>
          {rating === 'not_helpful' && <p className="mt-2 text-xs text-slate-600">You can also write below what is still wrong, and the expert will answer again.</p>}
        </div>
      )}

      {req.status !== 'closed' && (asExpert || req.farmer_id === account.id) && (
        <div className="rounded-3xl bg-white/80 p-4 ring-1 ring-slate-900/5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="thread-reply" className="text-sm font-semibold text-slate-800">{asExpert ? 'Your answer to the farmer' : 'Add more details or ask again'}</label>
            <MicButton lang={asExpert ? 'en' : lang} onText={setReply} />
          </div>
          {/* One-tap replies: they fill the box, nothing is sent until Send is tapped. */}
          <div role="group" aria-label="Quick replies" className="mb-3 flex flex-wrap gap-2">
            {quickRepliesFor(asExpert, lang).map((q) => (
              <button
                key={q}
                type="button"
                dir="auto"
                onClick={() => setReply((r) => addQuickReply(r, q))}
                className="min-h-11 cursor-pointer rounded-full bg-white px-4 text-left text-sm font-semibold text-forest ring-1 ring-forest-line transition hover:bg-forest-soft"
              >
                {q}
              </button>
            ))}
          </div>
          <textarea id="thread-reply" rows={asExpert ? 4 : 3} className={INPUT} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={asExpert ? 'Diagnosis, what to do now, products by type, and when to follow up' : 'Type or tap Speak'} />
          <Btn theme={theme} className="mt-3" icon={Send} disabled={busy || reply.trim().length < 2} onClick={send}>{asExpert ? 'Send answer' : 'Send'}</Btn>
        </div>
      )}
    </div>
  );
}
