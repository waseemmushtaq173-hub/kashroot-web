/**
 * POST { channel: 'sms' | 'whatsapp' | 'email', to, human? } → { token } (the code goes only to the phone or inbox).
 * Each code costs money: limited per number and per network (shared by all instances), and — when the
 * "I am human" check is switched on (HCAPTCHA_SECRET_KEY) — only for a browser that passed it.
 *
 * Every code is real: the answer carries a signed token, and the 6-digit
 * code itself goes only to the phone or the inbox. An email that the sender
 * cannot deliver (unconfigured, refused by Gmail, or slower than the
 * 15-second budget) is a 502 with { unavailable: true } — the browser says
 * so plainly and offers the portal's continue-without-verification step;
 * no code is ever shown on screen.
 */
import { NextResponse } from 'next/server';

import { normalise, sendCode, sendEmailCode, SmsProviderError, smsConfigured, whatsappConfigured, type Channel } from '@/lib/server/otp';
import { securityEvent } from '@/lib/server/securityLog';
import { hashed, sharedIpLimited, sharedLimited } from '@/lib/server/sharedLimit';
import { hasSigningSecret } from '@/lib/server/sign';

export async function POST(request: Request) {
  const { channel, to } = (await request.json().catch(() => ({}))) as { channel?: Channel; to?: string };
  if (channel !== 'sms' && channel !== 'whatsapp' && channel !== 'email') return NextResponse.json({ error: 'Choose SMS, WhatsApp or email.' }, { status: 400 });
  const phone = channel !== 'email';
  const target = normalise(channel, String(to ?? ''));
  if (!target) return NextResponse.json({ error: phone ? 'Enter a valid 10-digit Indian mobile number.' : 'Enter a valid email address.' }, { status: 400 });
  if (!hasSigningSecret()) return NextResponse.json({ error: 'Verification is not configured.' }, { status: 503 });

  const rateLimited = async () => {
    // A mobile code goes by SMS and WhatsApp together, so either one is enough; the limit is per channel.
    if (await sharedLimited(`otp:${channel}:${hashed(target)}`, 4, 15 * 60_000)) {
      securityEvent('rate_limited', { request, account: target, detail: `otp-send: 4 codes to one ${channel} address in 15 min` });
      return true;
    }
    if (await sharedIpLimited(request, 'otp', 20, 15 * 60_000)) return true;
    return false;
  };

  if (await rateLimited()) return NextResponse.json({ error: 'Too many codes requested. Wait a few minutes and try again.' }, { status: 429 });

  // Email: the 15-second send. Delivered: 200 with the signed token — the
  // code is only ever in the inbox. Not delivered (sender unconfigured,
  // refused, or slower than the budget): 502 unavailable — the browser
  // offers the portal's continue step; the code is never shown on screen.
  if (channel === 'email') {
    const { delivered, token } = await sendEmailCode(target);
    if (delivered) return NextResponse.json({ ok: true, emailDelivered: true, token, via: ['email'], to: target });
    return NextResponse.json(
      { error: 'The verification email could not be sent just now. This is the site’s email setup, not your address — you can continue without this step for now.', unavailable: true },
      { status: 502 },
    );
  }

  // A mobile code goes by SMS and WhatsApp together, so either one is enough.
  const configured = channel === 'sms' ? smsConfigured() || whatsappConfigured() : whatsappConfigured();
  if (!configured) {
    return NextResponse.json(
      { configured: false, error: `${channel === 'sms' ? 'SMS' : 'WhatsApp'} OTPs are not switched on for this site yet, so this step is optional for now.` },
      { status: 503 },
    );
  }
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
