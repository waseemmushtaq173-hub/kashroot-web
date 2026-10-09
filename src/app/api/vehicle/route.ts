/**
 * GET /api/vehicle?number=JK01AB1234 — real registration details (VAHAN) and
 * recent FASTag toll crossings (ULIP). Signed-in users only.
 */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/server/auth';
import { fastag, ulipConfigured, vahan } from '@/lib/server/ulip';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await requireUser(request))) return NextResponse.json({ error: 'Sign in to track vehicles.' }, { status: 401 });
  if (!ulipConfigured()) {
    return NextResponse.json(
      { configured: false, error: 'Live vehicle lookup is not connected yet. The site owner needs ULIP access (goulip.in) and must add ULIP_USERNAME and ULIP_PASSWORD.' },
      { status: 503 },
    );
  }
  const number = (new URL(request.url).searchParams.get('number') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(number)) {
    return NextResponse.json({ error: 'That does not look like an Indian registration number (e.g. JK01AB1234).' }, { status: 400 });
  }
  const [details, crossings] = await Promise.allSettled([vahan(number), fastag(number)]);
  if (details.status === 'rejected' && crossings.status === 'rejected') {
    return NextResponse.json({ error: 'The government vehicle service did not respond.', detail: String(details.reason?.message ?? details.reason) }, { status: 502 });
  }
  return NextResponse.json({
    number,
    details: details.status === 'fulfilled' ? details.value : null,
    crossings: crossings.status === 'fulfilled' ? crossings.value : null,
    fetchedAt: new Date().toISOString(),
    source: 'ULIP (VAHAN, FASTag), Government of India',
  });
}
