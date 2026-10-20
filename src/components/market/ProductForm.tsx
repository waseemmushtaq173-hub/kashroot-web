'use client';

/**
 * The fields of a marketplace product (Farmer portal, Agro-dealer portal and
 * Price Comparison). Up to three photos, made smaller on the phone before
 * upload; a new farm tool or input needs at least one, because Kissan Tools
 * buyers choose by the photo.
 */
import { Camera, X } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Field, INPUT } from '@/components/portal/kit';
import { compressImage } from '@/lib/client/image';
import { PRODUCE, SUBCATEGORIES, UNITS, type ListingInput } from '@/lib/db/market';

export const MAX_PHOTOS = 3;
/** The longest photo (data URL) the database keeps. */
const PHOTO_MAX_CHARS = 590_000;

/** Units sold whole (the stock is a whole number). */
const WHOLE_UNITS: ListingInput['unit'][] = ['box', 'piece', 'bag'];

/** The listing's photos: the list, or the single photo of an older listing. */
export const photosOf = (v: Pick<ListingInput, 'photo' | 'photos'>): string[] => (v.photos?.length ? v.photos : v.photo ? [v.photo] : []);

/** A photo is needed for a new farm tool or input. */
const photoNeeded = (v: ListingInput, isNew: boolean) => isNew && v.category === 'supplies';

export function ProductForm({ value: v, onChange, isNew = false }: { value: ListingInput; onChange: (v: ListingInput) => void; /** A new listing (a farm input then needs a photo). */ isNew?: boolean }) {
  const set = <K extends keyof ListingInput>(k: K, val: ListingInput[K]) => onChange({ ...v, [k]: val });
  const produce = v.category === 'produce';
  const photos = photosOf(v);
  const setPhotos = (list: string[]) => onChange({ ...v, photos: list.length ? list : null, photo: list[0] ?? null });
  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      // A very detailed photo can stay large: make it smaller again (the database takes up to about 600 KB each).
      let src = await compressImage(file, 900, 0.8);
      if (src.length > PHOTO_MAX_CHARS) src = await compressImage(file, 700, 0.6);
      if (src.length > PHOTO_MAX_CHARS) return toast.error('This photo is too big to send. Take it again from a little further away, or choose another photo.');
      setPhotos([...photos, src].slice(0, MAX_PHOTOS));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use that photo. Try another one.');
    }
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="What are you selling?">
        <select className={`${INPUT} min-h-11`} value={v.category} onChange={(e) => onChange({ ...v, category: e.target.value as ListingInput['category'], subcategory: e.target.value === 'produce' ? 'Apple' : SUBCATEGORIES[0], unit: e.target.value === 'produce' ? 'box' : 'piece' })}>
          <option value="supplies">Farm inputs & supplies</option>
          <option value="produce">Fruit / produce</option>
        </select>
      </Field>
      <Field label={produce ? 'Crop' : 'Type'}>
        <select className={`${INPUT} min-h-11`} value={v.subcategory ?? ''} onChange={(e) => set('subcategory', e.target.value)}>
          {(produce ? PRODUCE : SUBCATEGORIES).map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Product name">
          <input className={`${INPUT} min-h-11`} value={v.product} onChange={(e) => set('product', e.target.value)} placeholder={produce ? 'e.g. Delicious apple, A grade' : 'e.g. Apple corrugated box (10 kg)'} />
        </Field>
      </div>
      <Field label={produce ? 'Variety (optional)' : 'Brand / size (optional)'}>
        <input className={`${INPUT} min-h-11`} value={v.variety ?? ''} onChange={(e) => set('variety', e.target.value)} />
      </Field>
      <Field label="Grade (optional)">
        <input className={`${INPUT} min-h-11`} value={v.grade ?? ''} onChange={(e) => set('grade', e.target.value)} placeholder="e.g. A, Premium" />
      </Field>
      <Field label="Sold per">
        <select className={`${INPUT} min-h-11`} value={v.unit} onChange={(e) => set('unit', e.target.value as ListingInput['unit'])}>
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </Field>
      <Field label={`Price (₹ per ${v.unit})`}>
        <input type="number" inputMode="decimal" min={1} step="0.5" className={`${INPUT} min-h-11`} value={v.price || ''} onChange={(e) => set('price', Number(e.target.value))} />
      </Field>
      <Field label={`In stock (${v.unit})`}>
        <input type="number" inputMode={WHOLE_UNITS.includes(v.unit) ? 'numeric' : 'decimal'} min={0} className={`${INPUT} min-h-11`} value={v.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />
      </Field>
      <Field label="Your district">
        <input className={`${INPUT} min-h-11`} value={v.district} onChange={(e) => set('district', e.target.value)} placeholder="e.g. Sopore" />
      </Field>
      <Field label="Shop / seller name">
        <input className={`${INPUT} min-h-11`} value={v.seller_name} onChange={(e) => set('seller_name', e.target.value)} />
      </Field>
      <Field label="Mobile (buyers can call)">
        <input type="tel" inputMode="numeric" autoComplete="tel" className={`${INPUT} min-h-11`} value={v.phone} onChange={(e) => set('phone', e.target.value)} placeholder="e.g. 9876543210" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Details (optional)">
          <textarea rows={2} className={INPUT} value={v.details ?? ''} onChange={(e) => set('details', e.target.value)} placeholder="Delivery area, minimum order, delivery time" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <p className="text-sm font-medium text-slate-800">
          Photos {photoNeeded(v, isNew) ? <span className="text-rose-700">(at least one is needed)</span> : <span className="font-normal text-slate-500">(up to {MAX_PHOTOS}{produce ? ', optional' : ''})</span>}
        </p>
        <p className="text-xs text-slate-500">Take a clear photo of the real product. Buyers see it before they order.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {photos.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img src={src} alt={i === 0 ? 'Product' : `Product photo ${i + 1}`} className="h-28 w-28 rounded-xl object-cover ring-1 ring-slate-200" />
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white shadow ring-1 ring-slate-200"><X className="h-4 w-4" aria-hidden /></button>
              {i === 0 && photos.length > 1 && <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-2 text-[11px] font-semibold text-slate-700">Main</span>}
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className={`flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-2 text-center text-sm font-semibold ${photoNeeded(v, isNew) && !photos.length ? 'border-rose-300 bg-rose-50/50 text-rose-800' : 'border-slate-300 bg-slate-50 text-slate-700'} hover:bg-slate-100`}>
              <Camera className="h-6 w-6" aria-hidden />
              {photos.length ? 'Add another photo' : 'Add a photo'}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void addPhoto(f); }} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

/** Checks before saving; returns an error message or null. */
export function productProblem(v: ListingInput, opts: { isNew?: boolean } = {}): string | null {
  if (v.product.trim().length < 2) return 'Add the product name.';
  if (!(v.price > 0)) return 'Add a price.';
  if (!(v.quantity >= 0)) return 'Add how many you have in stock.';
  if (v.district.trim().length < 2) return 'Add your district.';
  if (v.seller_name.trim().length < 1) return 'Add your shop or seller name.';
  if (!/^(\+?91)?[6-9]\d{9}$/.test(v.phone.replace(/\s/g, ''))) return 'Add a 10-digit mobile number buyers can call.';
  if (photoNeeded(v, Boolean(opts.isNew)) && !photosOf(v).length) return 'Add a photo of the product. Tap “Add a photo” to take one with the camera or choose one from your gallery.';
  return null;
}
