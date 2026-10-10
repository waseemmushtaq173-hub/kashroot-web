/** POST { channel: 'sms' | 'whatsapp' | 'email', to } → { token } (the code goes only to the phone or inbox). */
import { NextResponse } from 'next/server';

import { emailConfigured, normalise, sendCode, SmsProviderError, smsConfigured, whatsappConfigured, type Channel } from '@/lib/server/otp';
import { hasSigningSecret, rateLimited } from '@/lib/server/sign';

export async function POST(request: Request) {
  const { channel, to } = (await request.json().catch(() => ({}))) as { channel?: Channel; to?: string };
  if (channel !== 'sms' && channel !== 'whatsapp' && channel !== 'email') return NextResponse.json({ error: 'Choose SMS, WhatsApp or email.' }, { status: 400 });
  const phone = channel !== 'email';
  const target = normalise(channel, String(to ?? ''));
  if (!target) return NextResponse.json({ error: phone ? 'Enter a valid 10-digit Indian mobile number.' : 'Enter a valid email address.' }, { status: 400 });
  const configured = channel === 'sms' ? smsConfigured() : channel === 'whatsapp' ? whatsappConfigured() : emailConfigured();
  if (!hasSigningSecret() || !configured) {
    return NextResponse.json(
      { configured: false, error: `${channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : 'Email'} OTPs are not switched on for this site yet, so this step is optional for now.` },
      { status: 503 },
    );
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(`otp:${channel}:${target}`, 4, 15 * 60_000) || rateLimited(`otp-ip:${ip}`, 20, 15 * 60_000)) {
    return NextResponse.json({ error: 'Too many codes requested. Wait a few minutes and try again.' }, { status: 429 });
  }
  try {
    const token = await sendCode(channel, target);
    return NextResponse.json({ token, to: phone ? `••••••${target.slice(-4)}` : target });
  } catch (err) {
    console.error('OTP send failed:', err instanceof Error ? err.message : err);
    if ((err as { code?: string })?.code === 'EAUTH') {
      return NextResponse.json({ error: 'The site’s email sender was refused by Gmail, so this step is optional for now.', unavailable: true }, { status: 502 });
    }
    // Provider messages (e.g. Fast2SMS "Insufficient balance") say what to fix; they hold no secrets.
    const reason = err instanceof SmsProviderError ? ` (${err.message})` : '';
    // A rejected key or empty balance is the site's problem, not the visitor's number.
    const siteSide = err instanceof SmsProviderError && /auth|key|token|permission|template|balance|wallet|recharge|verif|blocked|disabled|payment/i.test(err.message);
    const advice = siteSide ? ' This is a problem with the site’s setup, not your number — you can continue without it for now.' : ' Check the number and try again.';
    const what = channel === 'whatsapp' ? 'The WhatsApp message' : 'The SMS';
    return NextResponse.json({ error: phone ? `${what} could not be sent${reason}.${advice}` : 'The email could not be sent. Check the address and try again.', unavailable: siteSide }, { status: 502 });
  }
}
