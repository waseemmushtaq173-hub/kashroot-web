/**
 * The KashRoot team pass (20261117000000_kashroot_team.sql): the Admin pages
 * (/admin/…) are served only to a browser holding it — proxy.ts sends anyone
 * else to /team/unlock, which shows nothing to people outside the team.
 * /api/team/session gives it after the DATABASE says this person is the Super
 * Admin or a team member with something ticked, who passed two-step sign-in
 * and their admin code (kr_team_sections, asked as the person). Signed,
 * HttpOnly, Secure, SameSite=Lax, 15 minutes (the Admin lock's time), bound to
 * the browser (a hash of its user agent) and the account; the Admin pages
 * renew it while in use. It opens pages only: every Admin function and row is
 * checked again in the database, section by section. Server-only.
 */
import 'server-only';

import { createHash } from 'node:crypto';

import { hasSigningSecret, sign, verifySignature } from '@/lib/server/sign';

export const TEAM_COOKIE = 'kr_team';
const LIFE_S = 15 * 60;

const uaHash = (ua: string | null) => createHash('sha256').update(`kr-team|${ua ?? ''}`).digest('base64url').slice(0, 16);
const whoHash = (userId: string) => createHash('sha256').update(`kr-team-who|${userId}`).digest('base64url').slice(0, 16);

/** The Set-Cookie value for a team member just confirmed by the database. */
export function teamCookie(request: Request, userId: string): string {
  const value = `${Math.floor(Date.now() / 1000) + LIFE_S}.${uaHash(request.headers.get('user-agent'))}.${whoHash(userId)}`;
  return `${TEAM_COOKIE}=${value}.${sign(`team|${value}`)}; Path=/; Max-Age=${LIFE_S}; HttpOnly; Secure; SameSite=Lax`;
}

export const clearTeamCookie = `${TEAM_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** Does this request carry a genuine, unexpired team pass from this browser? (No signing secret: never.) */
export function hasTeamPass(cookieHeader: string | null, userAgent: string | null): boolean {
  const raw = cookieHeader?.match(/(?:^|;\s*)kr_team=([\w.-]+)/)?.[1];
  if (!raw || !hasSigningSecret()) return false;
  const parts = raw.split('.');
  if (parts.length !== 4) return false;
  const [exp, ua, who, sig] = parts;
  try {
    if (!verifySignature(`team|${exp}.${ua}.${who}`, sig)) return false;
  } catch {
    return false;
  }
  return Number(exp) > Date.now() / 1000 && ua === uaHash(userAgent);
}
