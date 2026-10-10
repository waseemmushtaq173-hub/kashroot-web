'use client';

/** The fields of a marketplace product (seller portal and Price Comparison). */
import { Camera, X } from 'lucide-react';
import { toast } from 'sonner';

import { Field, INPUT } from '@/components/portal/kit';
import { compressImage } from '@/lib/client/image';
import { PRODUCE, SUBCATEGORIES, UNITS, type ListingInput } from '@/lib/db/market';

export function ProductForm({ value: v, onChange }: { value: ListingInput; onChange: (v: ListingInput) => void }) {
  const set = <K extends keyof ListingInput>(k: K, val: ListingInput[K]) => onChange({ ...v, [k]: val });
  const produce = v.category === 'produce';
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="What are you selling?">
        <select className={INPUT} value={v.category} onChange={(e) => onChange({ ...v, category: e.target.value as ListingInput['category'], subcategory: e.target.value === 'produce' ? 'Apple' : SUBCATEGORIES[0], unit: e.target.value === 'produce' ? 'box' : 'piece' })}>
          <option value="supplies">Farm inputs & supplies</option>
          <option value="produce">Fruit / produce</option>
        </select>
      </Field>
      <Field label={produce ? 'Crop' : 'Type'}>
        <select className={INPUT} value={v.subcategory ?? ''} onChange={(e) => set('subcategory', e.target.value)}>
          {(produce ? PRODUCE : SUBCATEGORIES).map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Product name">
          <input className={INPUT} value={v.product} onChange={(e) => set('product', e.target.value)} placeholder={produce ? 'e.g. Delicious apple, A grade' : 'e.g. Apple corrugated box (10 kg)'} />
        </Field>
      </div>
      <Field label={produce ? 'Variety (optional)' : 'Brand / size (optional)'}>
        <input className={INPUT} value={v.variety ?? ''} onChange={(e) => set('variety', e.target.value)} />
      </Field>
      <Field label="Grade (optional)">
        <input className={INPUT} value={v.grade ?? ''} onChange={(e) => set('grade', e.target.value)} placeholder="e.g. A, Premium" />
      </Field>
      <Field label="Sold per">
        <select className={INPUT} value={v.unit} onChange={(e) => set('unit', e.target.value as ListingInput['unit'])}>
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </Field>
      <Field label={`Price (₹ per ${v.unit})`}>
        <input type="number" min={1} step="0.5" className={INPUT} value={v.price || ''} onChange={(e) => set('price', Number(e.target.value))} />
      </Field>
      <Field label={`In stock (${v.unit})`}>
        <input type="number" min={0} className={INPUT} value={v.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />
      </Field>
      <Field label="Your district">
        <input className={INPUT} value={v.district} onChange={(e) => set('district', e.target.value)} placeholder="e.g. Sopore" />
      </Field>
      <Field label="Shop / seller name">
        <input className={INPUT} value={v.seller_name} onChange={(e) => set('seller_name', e.target.value)} />
      </Field>
      <Field label="Mobile (buyers can call)">
        <input type="tel" className={INPUT} value={v.phone} onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Details (optional)">
          <textarea rows={2} className={INPUT} value={v.details ?? ''} onChange={(e) => set('details', e.target.value)} placeholder="Delivery area, minimum order, delivery time" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        {v.photo ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={v.photo} alt="Product" className="max-h-36 rounded-xl ring-1 ring-slate-200" />
            <button type="button" aria-label="Remove photo" onClick={() => set('photo', null)} className="absolute right-1 top-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white/90 shadow"><X className="h-4 w-4" aria-hidden /></button>
          </div>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
            <Camera className="h-4 w-4" aria-hidden /> Add a photo (optional)
            <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { set('photo', await compressImage(f, 900, 0.8)); } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not use that photo.'); } }} />
          </label>
        )}
      </div>
    </div>
  );
}

/** Checks before saving; returns an error message or null. */
export function productProblem(v: ListingInput): string | null {
  if (v.product.trim().length < 2) return 'Add the product name.';
  if (!(v.price > 0)) return 'Add a price.';
  if (!(v.quantity >= 0)) return 'Add how many you have in stock.';
  if (v.district.trim().length < 2) return 'Add your district.';
  if (v.seller_name.trim().length < 1) return 'Add your shop or seller name.';
  if (!/^(\+?91)?[6-9]\d{9}$/.test(v.phone.replace(/\s/g, ''))) return 'Add a 10-digit mobile number buyers can call.';
  return null;
}
