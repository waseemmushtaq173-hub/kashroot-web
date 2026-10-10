'use client';

/**
 * Photo diagnosis: the farmer takes a photo of a leaf, fruit or bark; the AI
 * says what it most likely is, how sure it is, and what to do — readable
 * aloud. "Send to an agronomist" turns it into an advisory question with the
 * photo attached (signed-in farmers).
 */
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Camera, CheckCircle2, Loader2, Send, Stethoscope, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge, Btn, INPUT, PORTAL_THEMES } from '@/components/portal/kit';
import { LangPicker, SpeakButton } from '@/components/voice/VoiceButtons';
import { compressImage } from '@/lib/client/image';
import { isRtl, type SpeechLang } from '@/lib/client/speech';
import { createRequest, sendMessage } from '@/lib/db/advisory';
import type { Account } from '@/lib/db/client';

const theme = PORTAL_THEMES.farmer;
const CROPS = ['Apple', 'Walnut', 'Almond', 'Cherry', 'Pear', 'Apricot', 'Saffron', 'Vegetables', 'Other'];

interface Diagnosis {
  plant_seen: string;
  healthy: boolean;
  likely_problem: string;
  confidence: 'high' | 'medium' | 'low';
  signs_seen: string[];
  other_possibilities: string[];
  do_now: string[];
  prevent: string[];
  see_expert: boolean;
  photo_quality_note: string;
  summary_spoken: string;
  summary_devanagari: string;
}

const CONFIDENCE = { high: { label: 'Fairly sure', tone: 'green' }, medium: { label: 'Possible', tone: 'amber' }, low: { label: 'Not sure', tone: 'red' } } as const;

export function PhotoDiagnosis({ account }: { account: Account | null }) {
  const [lang, setLang] = useState<SpeechLang>(account?.lang ?? 'en');
  const [crop, setCrop] = useState('Apple');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);

  const choose = async (file?: File) => {
    if (!file) return;
    try {
      setPhoto(await compressImage(file));
      setResult(null);
      setError(null);
      setSentId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use that photo.');
    }
  };

  const check = async () => {
    if (!photo) return toast.error('Take a photo first.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/diagnose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo, crop, notes, lang }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The photo could not be checked.');
      setResult(data as Diagnosis);
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'No internet connection. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendToExpert = async () => {
    if (!account || !photo) return;
    setBusy(true);
    try {
      const req = await createRequest({
        farmer_name: account.name,
        farmer_phone: account.phone,
        district: account.district,
        kind: 'question',
        crop,
        message: `Please check this photo.${notes ? ` ${notes}` : ''}${result ? ` (AI thought: ${result.likely_problem}, ${result.confidence} confidence)` : ''}`,
        photo,
        lang: lang === 'ks' ? 'ks' : lang,
      });
      if (result) await sendMessage(req.id, 'ai', 'KashRoot AI', result.summary_devanagari ? `${result.summary_spoken}\n@@SPEAK@@\n${result.summary_devanagari}` : result.summary_spoken);
      setSentId(req.id);
      toast.success('Sent to the agronomists');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  const rtl = isRtl(lang) ? 'rtl' : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {photo ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={photo} alt="Your photo" className="max-h-72 w-full rounded-2xl bg-slate-100 object-contain ring-1 ring-slate-200" />
            <button type="button" aria-label="Remove photo" onClick={() => { setPhoto(null); setResult(null); }} className="absolute right-2 top-2 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/90 shadow">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-8 text-center text-emerald-900 hover:bg-emerald-50">
            <Camera className="h-10 w-10" aria-hidden />
            <span className="text-base font-semibold">Take a photo of the leaf, fruit or bark</span>
            <span className="text-xs text-emerald-800">Close up, in daylight, one leaf filling the picture</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
          </label>
        )}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800">Crop</p>
          <div className="flex flex-wrap gap-2">
            {CROPS.map((c) => (
              <button key={c} type="button" aria-pressed={crop === c} onClick={() => setCrop(c)} className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold ${crop === c ? theme.solid : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>{c}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800">Answer in</p>
          <LangPicker value={lang} onChange={setLang} />
        </div>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Anything else? (optional)</span>
          <input className={`mt-1.5 ${INPUT}`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Started after rain, spreading fast" />
        </label>
        <Btn theme={theme} icon={busy ? Loader2 : Stethoscope} disabled={!photo || busy} onClick={() => void check()} className="w-full py-3 text-base">
          {busy ? 'Checking the photo…' : 'Check this photo'}
        </Btn>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      </div>

      <div>
        {!result ? (
          <div className="rounded-2xl bg-white/70 p-6 text-sm text-slate-600 ring-1 ring-slate-900/5">
            <p className="font-semibold text-slate-900">How it works</p>
            <p className="mt-2">KashRoot AI looks at your photo and tells you the most likely problem and what to do. It says when it isn’t sure — then send the photo to an agronomist with one tap.</p>
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl bg-white/85 p-5 ring-1 ring-slate-900/5" dir={rtl}>
            <div className="flex flex-wrap items-center gap-2">
              {result.healthy ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> : <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />}
              <h3 className="text-lg font-semibold text-slate-900">{result.likely_problem}</h3>
              <Badge tone={CONFIDENCE[result.confidence].tone}>{CONFIDENCE[result.confidence].label}</Badge>
            </div>
            <SpeakButton text={result.summary_spoken} speech={result.summary_devanagari || undefined} lang={lang} label="Listen to the answer" autoPlay />
            <p className="text-sm text-slate-800">{result.summary_spoken}</p>
            {result.do_now.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-900">Do now</p>
                <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-slate-700">{result.do_now.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
            {result.signs_seen.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-900">What the photo shows</p>
                <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-slate-700">{result.signs_seen.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
            {result.other_possibilities.length > 0 && <p className="text-sm text-slate-600">Could also be: {result.other_possibilities.join(', ')}</p>}
            {result.prevent.length > 0 && <p className="text-sm text-slate-600">Next time: {result.prevent.join(' · ')}</p>}
            {result.photo_quality_note && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{result.photo_quality_note}</p>}
            <p className="text-xs text-slate-500" dir="ltr">AI suggestion from a photo, not a lab test. Follow the product label and your horticulture department.</p>
            <div dir="ltr">
              {sentId ? (
                <Btn theme={theme} variant="soft" href="/expert?tab=mine">See the agronomist’s reply</Btn>
              ) : account ? (
                <Btn theme={theme} icon={Send} variant={result.see_expert ? 'solid' : 'soft'} disabled={busy} onClick={() => void sendToExpert()}>Send to an agronomist</Btn>
              ) : (
                <p className="text-sm text-slate-600"><Link href="/login/farmer?next=/orchard-health?tab=diagnose" className="font-semibold text-emerald-800 underline">Sign in</Link> to send this photo to an agronomist.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
