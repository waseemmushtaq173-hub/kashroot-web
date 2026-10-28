/**
 * POST { channel: 'sms' | 'whatsapp' | 'email', to, human? } → { token } (the code goes only to the phone or inbox).
 * Each code costs money: limited per number and per network (shared by all instances), and — when the
 * "I am human" check is switched on (TURNSTILE_SECRET_KEY) — only for a browser that passed it.
 */
import { NextResponse } from 'next/server';

import { emailConfigured, normalise, sendCode, SmsProviderError, smsConfigured, whatsappConfigured, type Channel } from '@/lib/server/otp';
import { isHuman, NOT_HUMAN } from '@/lib/server/humanCheck';
import { securityEvent } from '@/lib/server/securityLog';
import { hashed, sharedIpLimited, sharedLimited } from '@/lib/server/sharedLimit';
import { hasSigningSecret } from '@/lib/server/sign';

export async function POST(request: Request) {
  const { channel, to, human } = (await request.json().catch(() => ({}))) as { channel?: Channel; to?: string; human?: string };
  if (channel !== 'sms' && channel !== 'whatsapp' && channel !== 'email') return NextResponse.json({ error: 'Choose SMS, WhatsApp or email.' }, { status: 400 });
  const phone = channel !== 'email';
  const target = normalise(channel, String(to ?? ''));
  if (!target) return NextResponse.json({ error: phone ? 'Enter a valid 10-digit Indian mobile number.' : 'Enter a valid email address.' }, { status: 400 });
  // A mobile code goes by SMS and WhatsApp together, so either one is enough.
  const configured = channel === 'sms' ? smsConfigured() || whatsappConfigured() : channel === 'whatsapp' ? whatsappConfigured() : emailConfigured();
  if (!hasSigningSecret() || !configured) {
    return NextResponse.json(
      { configured: false, error: `${channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : 'Email'} OTPs are not switched on for this site yet, so this step is optional for now.` },
      { status: 503 },
    );
  }
  if (!(await isHuman(request, human))) return NextResponse.json({ error: NOT_HUMAN }, { status: 403 });
  if (await sharedLimited(`otp:${channel}:${hashed(target)}`, 4, 15 * 60_000)) {
    securityEvent('rate_limited', { request, account: target, detail: 'otp-send: 4 codes to one number in 15 min' });
    return NextResponse.json({ error: 'Too many codes requested. Wait a few minutes and try again.' }, { status: 429 });
  }
  if (await sharedIpLimited(request, 'otp', 20, 15 * 60_000)) return NextResponse.json({ error: 'Too many codes requested. Wait a few minutes and try again.' }, { status: 429 });
  try {
    const { token, via } = await sendCode(channel, target);
    return NextResponse.json({ token, via, to: phone ? `••••••${target.slice(-4)}` : target });
  } catch (err) {
    console.error('OTP send failed:', err instanceof Error ? err.message : err);
    if ((err as { code?: string })?.code === 'EAUTH') {
      return NextResponse.json({ error: 'The site’s email sender was refused by Gmail, so this step is optional for now.', unavailable: true }, { status: 502 });
    }
    // The provider's own words (e.g. Fast2SMS "Insufficient balance") are in the server's log above,
    // not in the answer: they tell strangers about the site's SMS account.
    // A rejected key or empty balance is the site's problem, not the visitor's number.
    const siteSide = err instanceof SmsProviderError && /auth|key|token|permission|template|balance|wallet|recharge|verif|blocked|disabled|payment/i.test(err.message);
    const advice = siteSide ? ' This is a problem with the site’s setup, not your number — you can continue without it for now.' : ' Check the number and try again.';
    const what = channel === 'whatsapp' ? 'The WhatsApp message' : 'The code';
    return NextResponse.json({ error: phone ? `${what} could not be sent.${advice}` : 'The email could not be sent. Check the address and try again.', unavailable: siteSide }, { status: 502 });
  }
}
