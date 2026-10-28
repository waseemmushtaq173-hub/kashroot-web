'use client';

/**
 * Phone numbers only for signed-in people (20261107000000_private_phones.sql):
 * the database lets a signed-out visitor read every column of the listings,
 * the mandi rates and the cold-store directory except the phone columns — a
 * query that asks for them would be refused. So the columns a query asks for
 * depend on whether someone is signed in, and the page shows "Sign in to
 * call" instead of a number.
 */
import { supabase } from '@/lib/supabase';

const PHONE_COLUMNS = new Set(['phone', 'manager_phone']);

/** Is anyone signed in on this device (a Supabase session)? */
export async function signedIn(): Promise<boolean> {
  try {
    return Boolean((await supabase.auth.getSession()).data.session);
  } catch {
    return false;
  }
}

/** "id, seller_name, phone, …" without the phone columns. */
export const withoutPhones = (cols: string): string =>
  cols
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && !PHONE_COLUMNS.has(c))
    .join(', ');

/** The columns to ask for: all of them when signed in; without the phones when not. */
export async function readableColumns(cols: string): Promise<string> {
  return (await signedIn()) ? cols : withoutPhones(cols);
}
