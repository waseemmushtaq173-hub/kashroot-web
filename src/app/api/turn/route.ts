/**
 * GET /api/turn — ICE servers for video calls. Public STUN always; a TURN
 * relay too when TURN_URLS (comma-separated turn:/turns: URLs), TURN_USERNAME
 * and TURN_CREDENTIAL are set — needed on networks that block direct calls.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const iceServers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const urls = (process.env.TURN_URLS ?? '').split(',').map((u) => u.trim()).filter((u) => /^turns?:/.test(u));
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return NextResponse.json({ iceServers, relay: iceServers.length > 1 }, { headers: { 'cache-control': 'no-store' } });
}
