'use client';

/**
 * Daily mandi rates posted on KashRoot by approved reporters (mandi_rates):
 * anyone reads them; only reporters (role REPORTER) and admins post.
 */
import { dbMessage, supabase } from '@/lib/db/client';

export type RateUnit = 'box' | 'kg' | 'quintal';

export interface MandiRate {
  id: string;
  posted_by: string;
  reporter_name: string;
  phone: string | null;
  state: string;
  district: string | null;
  mandi: string;
  commodity: string;
  variety: string | null;
  grade: string | null;
  unit: RateUnit;
  box_kg: number | null;
  min_price: number;
  modal_price: number;
  max_price: number;
  rate_date: string;
  note: string | null;
  created_at: string;
  /** Accuracy: not yet checked, confirmed, someone reported it wrong, or wrong (decided by KashRoot). */
  status?: 'pending' | 'verified' | 'disputed' | 'wrong';
  confirms?: number;
  reports?: number;
}

export type RateInput = Pick<MandiRate, 'reporter_name' | 'phone' | 'state' | 'district' | 'mandi' | 'commodity' | 'variety' | 'grade' | 'unit' | 'box_kg' | 'min_price' | 'modal_price' | 'max_price' | 'note'>;

/** Kashmir's main fruit and vegetable mandis, for the reporter's list. */
export const KNOWN_MANDIS = ['Sopore', 'Parimpora (Srinagar)', 'Shopian', 'Pachhar (Pulwama)', 'Anantnag', 'Kulgam', 'Baramulla', 'Handwara', 'Ganderbal', 'Narwal (Jammu)', 'Azadpur (Delhi)'];
export const KNOWN_CROPS = ['Apple', 'Walnut', 'Almond', 'Cherry', 'Pear', 'Plum', 'Apricot', 'Saffron', 'Rice', 'Potato', 'Onion', 'Tomato', 'Vegetables'];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Each reporter's latest rate per mandi, crop, variety and grade from the last few days. */
export async function recentRates(days = 4): Promise<MandiRate[]> {
  const since = iso(new Date(Date.now() - days * 86_400_000));
  const { data, error } = await supabase.from('mandi_rates').select('*').gte('rate_date', since).order('rate_date', { ascending: false }).order('created_at', { ascending: false }).limit(1000);
  if (error) throw new Error(dbMessage(error, 'Could not load the mandi rates.'));
  const seen = new Set<string>();
  // Rates KashRoot found wrong are never shown; the next-latest one is.
  return ((data ?? []) as MandiRate[]).filter((r) => r.status !== 'wrong').filter((r) => {
    const k = `${r.posted_by}|${r.mandi}|${r.commodity}|${r.variety ?? ''}|${r.grade ?? ''}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function postRate(input: RateInput): Promise<void> {
  const { error } = await supabase.from('mandi_rates').insert(input);
  if (error) throw new Error(dbMessage(error, 'Could not post the rate.'));
}

export async function removeRate(id: string): Promise<void> {
  const { error } = await supabase.from('mandi_rates').delete().eq('id', id);
  if (error) throw new Error(dbMessage(error, 'Could not remove the rate.'));
}

/** Price per kg, when it can be worked out (a box needs its weight). */
export function perKg(r: Pick<MandiRate, 'unit' | 'box_kg'>, price: number): number | null {
  if (r.unit === 'kg') return price;
  if (r.unit === 'quintal') return price / 100;
  return r.box_kg ? price / r.box_kg : null;
}
