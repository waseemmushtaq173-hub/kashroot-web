'use client';

/**
 * A farmer's request to the advisory team: a question, a soil-test booking or
 * a video call. Big choices, speak-instead-of-type, a camera photo, and an
 * instant AI first answer while an expert is notified.
 */
import { useState } from 'react';
import { Camera, FlaskConical, Loader2, MessageCircle, Send, Video, X } from 'lucide-react';
import { toast } from 'sonner';

import { Btn, Field, INPUT, PORTAL_THEMES } from '@/components/portal/kit';
import { LangPicker, MicButton } from '@/components/voice/VoiceButtons';
import { compressImage } from '@/lib/client/image';
import { isRtl, needsDevanagari, type SpeechLang } from '@/lib/client/speech';
import { createRequest, sendMessage, type AdvisoryRequest, type RequestKind } from '@/lib/db/advisory';
import type { Account } from '@/lib/db/client';

const theme = PORTAL_THEMES.expert;
const CROPS = ['Apple', 'Walnut', 'Almond', 'Cherry', 'Pear', 'Saffron', 'Rice', 'Vegetables', 'Other'];

const KINDS: { id: RequestKind; label: string; hint: string; icon: typeof MessageCircle }[] = [
  { id: 'question', label: 'Ask a question', hint: 'Pest, disease, fertiliser…', icon: MessageCircle },
  { id: 'soil_test', label: 'Book a soil test', hint: 'An expert arranges it', icon: FlaskConical },
  { id: 'video_call', label: 'Video call an expert', hint: 'Show the problem on camera', icon: Video },
];

const PLACEHOLDER: Record<RequestKind, string> = {
  question: 'e.g. Black spots on apple leaves after last week’s rain',
  soil_test: 'e.g. 8 kanal apple orchard, leaves turning yellow — want to know what fertiliser to use',
  video_call: 'e.g. Bark is cracking on young walnut trees — please see it',
};

export function AskForm({ account, onSent, initialKind = 'question' }: { account: Account; onSent: (req: AdvisoryRequest) => void; initialKind?: RequestKind }) {
  const [kind, setKind] = useState<RequestKind>(initialKind);
  const [lang, setLang] = useState<SpeechLang>(account.lang ?? 'en');
  const [crop, setCrop] = useState('Apple');
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [when, setWhen] = useState('');
  const [phone, setPhone] = useState(account.phone);
  const [district, setDistrict] = useState(account.district);
  const [busy, setBusy] = useState(false);

  const choosePhoto = async (file?: File) => {
    if (!file) return;
    try {
      setPhoto(await compressImage(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use that photo.');
    }
  };

  const submit = async () => {
    if (message.trim().length < 5) return toast.error('Tell us the problem in a few words — you can tap Speak.');
    if (kind !== 'question' && !/^(\+?91)?[6-9]\d{9}$/.test(phone.replace(/\s/g, ''))) return toast.error('Add your mobile number so the expert can reach you.');
    setBusy(true);
    try {
      const req = await createRequest({
        farmer_name: account.name,
        farmer_phone: phone.replace(/\s/g, ''),
        district,
        kind,
        crop,
        message: message.trim(),
        photo,
        preferred_time: when,
        lang,
      });
      // Instant first answer from the AI agronomist; the expert still replies.
      try {
        const speakAs = (await needsDevanagari(lang)) ? 'hi' : undefined;
        const res = await fetch('/api/advisory/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: message.trim(), crop, photo, lang, speakAs, kind }),
        });
        const data = (await res.json().catch(() => ({}))) as { reply?: string; speech?: string };
        if (data.reply) await sendMessage(req.id, 'ai', 'KashRoot AI', data.speech ? `${data.reply}\n@@SPEAK@@\n${data.speech}` : data.reply);
      } catch {
        // The request is sent either way; the AI note is a bonus.
      }
      toast.success(kind === 'question' ? 'Question sent to the experts' : kind === 'soil_test' ? 'Soil test requested' : 'Video call requested — an expert will accept it');
      setMessage('');
      setPhoto(null);
      onSent(req);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-800">What do you need?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3 text-left transition ${kind === k.id ? 'bg-purple-50 ring-2 ring-purple-500' : 'bg-white ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${theme.tile}`}>
                <k.icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block font-semibold text-slate-900">{k.label}</span>
                <span className="block text-xs text-slate-500">{k.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">Answer in</p>
        <LangPicker value={lang} onChange={setLang} />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-800">Crop</legend>
        <div className="flex flex-wrap gap-2">
          {CROPS.map((c) => (
            <button key={c} type="button" aria-pressed={crop === c} onClick={() => setCrop(c)} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${crop === c ? theme.solid : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
              {c}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="ask-message" className="text-sm font-semibold text-slate-800">Tell us the problem</label>
          <MicButton lang={lang} onText={setMessage} />
        </div>
        <textarea id="ask-message" rows={4} dir={isRtl(lang) ? 'rtl' : undefined} className={INPUT} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={PLACEHOLDER[kind]} />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-800">Photo {kind === 'question' ? '(helps a lot)' : '(optional)'}</p>
        {photo ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={photo} alt="Your photo" className="max-h-48 rounded-2xl object-contain ring-1 ring-slate-200" />
            <button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)} className="absolute right-2 top-2 grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-white/90 text-slate-700 shadow">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-purple-300 bg-purple-50/60 p-5 text-sm font-semibold text-purple-900 hover:bg-purple-50">
            <Camera className="h-5 w-5" aria-hidden /> Take or choose a photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void choosePhoto(e.target.files?.[0])} />
          </label>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={kind === 'question' ? 'Mobile number (optional)' : 'Mobile number'} hint="The expert may call you on this number.">
          <input className={INPUT} type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, '').slice(0, 14))} placeholder="10-digit mobile" />
        </Field>
        <Field label="District">
          <input className={INPUT} value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Shopian" />
        </Field>
        {kind !== 'question' && (
          <Field label={kind === 'soil_test' ? 'When can the sample be taken?' : 'Good time to call'}>
            <input className={INPUT} value={when} onChange={(e) => setWhen(e.target.value)} placeholder={kind === 'soil_test' ? 'e.g. Any morning this week' : 'e.g. Today after 4 pm'} />
          </Field>
        )}
      </div>

      <Btn theme={theme} type="submit" icon={busy ? Loader2 : Send} disabled={busy} className="py-3 text-base">
        {busy ? 'Sending…' : kind === 'question' ? 'Send to the experts' : kind === 'soil_test' ? 'Request soil test' : 'Request video call'}
      </Btn>
    </form>
  );
}
