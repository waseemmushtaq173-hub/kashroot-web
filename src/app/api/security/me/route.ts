/**
 * GET /api/security/me → { net }: the caller's own network as the security
 * log writes it (lib/server/securityLog: a one-way hash, never the address),
 * so Admin → Security can mark "from your network" — an admin's own tests
 * should not look like an attack. Nothing else is told.
 */
import { NextResponse } from 'next/server';

import { hashed } from '@/lib/server/sharedLimit';
import { clientIp } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return NextResponse.json({ net: hashed(`ip|${clientIp(request)}`) }, { headers: { 'cache-control': 'no-store' } });
}
