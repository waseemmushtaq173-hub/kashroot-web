/**
 * GET /api/turn — ICE servers for video calls. Public STUN always; a TURN
 * relay too when TURN_URLS (comma-separated turn:/turns: URLs), TURN_USERNAME
 * and TURN_CREDENTIAL are set — needed on networks that block direct calls.
 * The relay's login is given only to signed-in people (calls are between a
 * signed-in farmer and expert), so strangers cannot use it as a free relay.
 */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/server/auth';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (ipLimited(request, 'turn', 30)) return tooMany();
  const iceServers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const urls = (process.env.TURN_URLS ?? '').split(',').map((u) => u.trim()).filter((u) => /^turns?:/.test(u));
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL && (await requireUser(request))) {
    iceServers.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return NextResponse.json({ iceServers, relay: iceServers.length > 1 }, { headers: { 'cache-control': 'no-store' } });
}
