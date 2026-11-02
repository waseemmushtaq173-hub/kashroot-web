/**
 * Security notices by email (lib/server/mail), from what the sign-in proxy
 * (app/api/supabase) sees go through Supabase:
 *   - a password sign-in on a device this account was not signed in on before
 *     ("Chrome on Android, Srinagar") — not for an account made minutes ago;
 *   - the password, email or phone of an account changed.
 * A device is known by a cookie holding a short signature per account
 * (never the account itself); a cleared or private browser counts as new.
 * Never throws: a notice must not break a sign-in.
 */
import 'server-only';

import { after } from 'next/server';

import { deviceName } from '@/lib/emailLetters';
import { flushOutbox, queueNotice } from '@/lib/server/mail';
import { hasSigningSecret, sign } from '@/lib/server/sign';

const COOKIE = 'kr_known';
const YEAR = 365 * 86_400;

const tag = (userId: string) => sign(`kr-device|${userId}`).slice(0, 22);

function cookieTags(request: Request): string[] {
  const raw = request.headers.get('cookie')?.match(/(?:^|;\s*)kr_known=([A-Za-z0-9_.-]+)/)?.[1] ?? '';
  return raw ? raw.split('.').filter(Boolean) : [];
}

/** "Chrome on Android, Srinagar". */
export const deviceOf = (request: Request) => deviceName(request.headers.get('user-agent') ?? '', request.headers.get('x-vercel-ip-city'));

function queue(kinds: Parameters<typeof queueNotice>[0][], userId: string, detail?: string) {
  if (!kinds.length) return;
  const work = async () => {
    for (const kind of kinds) await queueNotice(kind, userId, detail);
    await flushOutbox(5);
  };
  try {
    after(work);
  } catch {
    void work();
  }
}

/**
 * After a successful password sign-in: a notice when this device is new to
 * the account. Returns the Set-Cookie value that remembers the device, if any.
 */
export function afterPasswordSignIn(request: Request, responseText: string): string | null {
  try {
    if (!hasSigningSecret()) return null;
    const user = (JSON.parse(responseText) as { user?: { id?: string; created_at?: string } }).user;
    if (!user?.id) return null;
    const mine = tag(user.id);
    const tags = cookieTags(request);
    if (tags.includes(mine)) return null;
    const brandNew = user.created_at && Date.now() - Date.parse(user.created_at) < 15 * 60_000;
    if (!brandNew) queue(['new_signin'], user.id, deviceOf(request));
    const kept = [mine, ...tags].slice(0, 5).join('.');
    return `${COOKIE}=${kept}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`;
  } catch {
    return null;
  }
}

/** After the account was changed (PUT auth/v1/user): a notice for each of password, email, phone. */
export function afterUserChange(requestBody: ArrayBuffer | undefined, responseText: string): void {
  try {
    if (!requestBody || requestBody.byteLength > 20_000) return;
    const asked = JSON.parse(new TextDecoder().decode(requestBody)) as { password?: unknown; email?: unknown; phone?: unknown };
    const user = JSON.parse(responseText) as { id?: string };
    if (!user?.id) return;
    const kinds: Parameters<typeof queueNotice>[0][] = [];
    if (asked.password) kinds.push('password_changed');
    if (asked.email) kinds.push('email_changed');
    if (asked.phone) kinds.push('phone_changed');
    queue(kinds, user.id);
  } catch {
    /* never break the change for a notice */
  }
}
