/**
 * Who is really calling an API route, and which business may they act for? The page cannot say: the person is the one the
 * sign-in service vouches for behind the Bearer token, and what they may touch is read from the database, never from a
 * field the request carries (`viewerRole`, `farmerId`, `actorName` and the like are only ever hints for the screen).
 * Server-only.
 */
import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';
import { isSuperAdminCaller } from '@/lib/server/callerRole';

export interface Caller {
  id: string;
  /** Lower-cased; null when the account has none. */
  email: string | null;
  /** True only when the sign-in service says the e-mail was confirmed: an unconfirmed address proves nothing. */
  emailConfirmed: boolean;
  token: string;
}

/** The Bearer token of a request, or null. */
export function bearerOf(request: Request): string | null {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return token && token.length <= 4096 ? token : null;
}

// A person who just signed in sends many requests in a burst: ask the sign-in service once per token for a few seconds.
const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; caller: Caller }>();

/** The verified caller behind the request's Bearer token, or null (no token, a bad or expired one, the service unreachable). */
export async function verifiedCaller(request: Request): Promise<Caller | null> {
  const token = bearerOf(request);
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!token || !origin || !anon) return null;

  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.caller;

  try {
    const res = await fetch(`${origin}/auth/v1/user`, {
      headers: { apikey: anon, authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { id?: string; email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null };
    if (!u?.id) return null;
    const caller: Caller = {
      id: u.id,
      email: u.email ? u.email.trim().toLowerCase() : null,
      emailConfirmed: Boolean(u.email_confirmed_at || u.confirmed_at),
      token,
    };
    if (cache.size > 500) cache.clear();
    cache.set(token, { at: Date.now(), caller });
    return caller;
  } catch {
    return null;
  }
}

/**
 * The database client a route uses. With the service key it can do what the route has already authorised; without it, it
 * acts as the caller, so the database's own row rules still apply and a route can never read more than the person could.
 */
export function dbFor(caller: Caller | null): SupabaseClient {
  const url = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL) || process.env.SUPABASE_URL || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || '';
  if (service) return createClient(url, service, { auth: { persistSession: false } });
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: caller ? { headers: { authorization: `Bearer ${caller.token}` } } : undefined,
  });
}

/** True when the route runs with the service key (it can see every row, so it must filter every query itself). */
export const hasServiceKey = (): boolean => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

export interface OrgAccess {
  superAdmin: boolean;
  /** Businesses this person owns or works for. */
  orgIds: string[];
  /** Businesses they own (not only staff): the owner may register staff and record the ledger. */
  ownedOrgIds: string[];
}

/**
 * Which businesses may this caller open? The Super Admin: every one. Anyone else: the ones they own (the owner account that
 * registered them, or the confirmed e-mail it was registered with) and the ones that listed them as active staff.
 * A match by confirmed e-mail is an exact one (the address is stored in lower case): never a pattern, where `_` or `%`
 * in an address would match other addresses. It is saved on the business (`owner_user_id`) so the next check is by account.
 */
export async function orgAccessOf(request: Request, db: SupabaseClient, caller: Caller): Promise<OrgAccess> {
  const superAdmin = await isSuperAdminCaller(request);
  const owned = new Set<string>();
  const staffOf = new Set<string>();

  const byId = await db.from('cold_storage_organizations').select('id').eq('owner_user_id', caller.id);
  for (const r of byId.data ?? []) owned.add(String(r.id));

  if (caller.email && caller.emailConfirmed) {
    const byMail = await db.from('cold_storage_organizations').select('id, owner_user_id').eq('owner_email', caller.email);
    for (const r of byMail.data ?? []) {
      // Someone else already owns this business under their account: a matching address does not take it over.
      if (r.owner_user_id && String(r.owner_user_id) !== caller.id) continue;
      owned.add(String(r.id));
      if (!r.owner_user_id) await db.from('cold_storage_organizations').update({ owner_user_id: caller.id }).eq('id', r.id).is('owner_user_id', null);
    }
  }

  const staffById = await db.from('owner_staff_members').select('organization_id').eq('user_id', caller.id).eq('employment_status', 'ACTIVE');
  for (const r of staffById.data ?? []) staffOf.add(String(r.organization_id));
  if (caller.email && caller.emailConfirmed) {
    const staffByMail = await db.from('owner_staff_members').select('organization_id, user_id').eq('email', caller.email).eq('employment_status', 'ACTIVE');
    for (const r of staffByMail.data ?? []) if (!r.user_id || String(r.user_id) === caller.id) staffOf.add(String(r.organization_id));
  }

  return { superAdmin, orgIds: [...new Set([...owned, ...staffOf])], ownedOrgIds: [...owned] };
}

/** Which cold-storage facilities (rental listings) belong to businesses or owners this caller runs? Used to tell an owner from a farmer. */
export async function runsFacility(db: SupabaseClient, caller: Caller, access: OrgAccess, facilityId: string): Promise<boolean> {
  if (access.superAdmin) return true;
  const { data } = await db.from('rental_listings').select('owner_id, organization_id').eq('id', facilityId).maybeSingle();
  if (!data) return false;
  if (data.owner_id && String(data.owner_id) === caller.id) return true;
  return Boolean(data.organization_id && access.orgIds.includes(String(data.organization_id)));
}
