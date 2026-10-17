'use client';

/**
 * Applying to add information on KashRoot — as a Mandi Helper or an
 * agronomist. Besides the phone number, the applicant gives their mandi or
 * workplace, a licence / registration number and a photo of a licence or ID
 * card. Only the KashRoot admin sees these; the admin also phones the
 * applicant before approving (Admin → Approvals).
 */
import { useState } from 'react';
import { Camera, Loader2, Send } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Btn, Field, INPUT, type PortalTheme } from '@/components/portal/kit';
import { compressImage } from '@/lib/client/image';
import { requestStaffRole } from '@/lib/db/advisory';
import type { Account } from '@/lib/db/client';
import { sendRoleProof } from '@/lib/db/contributions';

const COPY = {
  REPORTER: {
    place: ['Your mandi and shop', 'e.g. Sopore fruit mandi, shop 14'],
    licence: ['Mandi licence or trade licence number (optional)', 'e.g. APMC/SOP/1234'],
    details: ['Your work at the mandi', 'e.g. Commission agent for 12 years, apples and pears'],
    photo: 'Photo of your mandi licence, trade licence or ID card',
  },
  EXPERT: {
    place: ['Where you work', 'e.g. Horticulture Development Officer, Shopian'],
    licence: ['Registration or employee ID (optional)', 'e.g. HDO/SHP/2019/045'],
    details: ['Your qualification', 'e.g. MSc Horticulture, SKUAST-K'],
    photo: 'Photo of your degree certificate or office ID card',
  },
} as const;

const PHOTO_LIMIT = 590_000;

export function RoleApplicationForm({ role, account, theme, onSent }: { role: 'REPORTER' | 'EXPERT'; account: Account; theme: PortalTheme; onSent: () => void }) {
  const copy = COPY[role];
  const [f, setF] = useState({ phone: account.phone ?? '', place: '', licence: '', details: '' });
  const [photo, setPhoto] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      let data = await compressImage(file, 1200, 0.78);
      if (data.length > PHOTO_LIMIT) data = await compressImage(file, 900, 0.68);
      if (data.length > PHOTO_LIMIT) throw new Error('That photo is too large. Take it again from a little further away.');
      setPhoto(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use that photo.');
    } finally {
      setReading(false);
    }
  };

  const send = async () => {
    const phone = f.phone.replace(/\D/g, '').slice(-10);
    if (phone.length !== 10) return toast.error('Write your 10-digit mobile number. KashRoot will call you on it.');
    if (f.place.trim().length < 3) return toast.error(`${copy.place[0]}?`);
    if (f.details.trim().length < 5) return toast.error(`${copy.details[0]}?`);
    if (!photo) return toast.error(`Add a ${copy.photo.charAt(0).toLowerCase()}${copy.photo.slice(1)}.`);
    setBusy(true);
    try {
      await requestStaffRole(role, { name: account.name, phone, email: account.email, details: f.details.trim() });
      await sendRoleProof(role, { place: f.place, licence: f.licence, photo });
      toast.success('Application sent — KashRoot will call you before approving');
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your application.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mobile number" hint="KashRoot will phone you on this number before approving.">
          <input className={INPUT} inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="10-digit mobile" />
        </Field>
        <Field label={copy.place[0]}>
          <input className={INPUT} value={f.place} onChange={set('place')} placeholder={copy.place[1]} />
        </Field>
        <Field label={copy.details[0]}>
          <input className={INPUT} value={f.details} onChange={set('details')} placeholder={copy.details[1]} />
        </Field>
        <Field label={copy.licence[0]}>
          <input className={INPUT} value={f.licence} onChange={set('licence')} placeholder={copy.licence[1]} />
        </Field>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">{copy.photo}</p>
        <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/70 p-3 text-sm text-slate-700 hover:bg-white">
          {reading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Camera className="h-5 w-5" aria-hidden />}
          {photo ? 'Change photo' : 'Take or choose a photo'}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- local preview of a data URL
          <img src={photo} alt="Your ID photo" className="mt-2 max-h-48 rounded-xl object-contain ring-1 ring-slate-200" />
        )}
        <p className="mt-1 text-xs text-slate-500">Only the KashRoot admin sees this photo. If you use an Aadhaar card, cover the first 8 digits.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Applying as {account.name} · {account.email}</p>
        <Btn theme={theme} type="submit" icon={Send} disabled={busy || reading}>{busy ? 'Sending…' : 'Send application'}</Btn>
      </div>
    </form>
  );
}
