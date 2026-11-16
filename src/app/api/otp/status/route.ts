/**
 * GET — which one-time-code providers this deployment can see, so the owner
 * can check their Vercel settings. Names only, never values. Open it in a
 * browser: /api/otp/status
 */
import { NextResponse } from 'next/server';

import { checkEmailRoutes, emailConfigured, emailSenderInfo, emailProvider as pickEmailProvider, smsConfigured, whatsappConfigured } from '@/lib/server/otp';
import { sharedIpLimited } from '@/lib/server/sharedLimit';
import { hasSigningSecret } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

const has = (name: string) => Boolean(process.env[name]?.trim());

export async function GET(request: Request) {
  const secret = hasSigningSecret();
  const smsProvider = has('MSG91_AUTH_KEY') && has('MSG91_TEMPLATE_ID') ? 'MSG91' : has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_PHONE_NUMBER') ? 'Twilio' : has('FAST2SMS_API_KEY') ? 'Fast2SMS' : null;
  const emailProvider = pickEmailProvider();

  const problems: string[] = [];
  if (!secret) problems.push('No signing secret: add OTP_SECRET (any long random text), or an SMS/email provider key.');
  if (!smsProvider) problems.push('No SMS provider found. For Fast2SMS the variable must be named exactly FAST2SMS_API_KEY.');
  if (!emailProvider) {
    if (has('GMAIL_USER') !== has('GMAIL_APP_PASSWORD')) problems.push('Gmail needs both GMAIL_USER and GMAIL_APP_PASSWORD.');
    else problems.push('No email provider found. Add GMAIL_USER and GMAIL_APP_PASSWORD (or RESEND_API_KEY).');
  }
  if (emailProvider === 'Resend' && !has('RESEND_FROM')) problems.push('RESEND_FROM is not set, so Resend can only email your own Resend account address. Add GMAIL_USER and GMAIL_APP_PASSWORD (used automatically), or verify a domain in Resend and set RESEND_FROM.');

  // ?check=1 really logs in to each email route (no mail is sent) and says why one fails. A few a quarter-hour per network.
  let routes: Record<string, string> | undefined;
  if (new URL(request.url).searchParams.get('check') === '1') {
    if (await sharedIpLimited(request, 'otp-status-check', 6, 15 * 60_000)) return NextResponse.json({ error: 'Too many checks. Wait a few minutes.' }, { status: 429 });
    routes = await checkEmailRoutes();
  }

  return NextResponse.json({
    smsOtp: secret && smsConfigured() ? `on (${smsProvider}${smsProvider === 'Fast2SMS' ? `, route ${(process.env.FAST2SMS_ROUTE ?? 'otp').trim() || 'otp'}` : ''})` : 'off',
    whatsappOtp: secret && whatsappConfigured() ? 'on (WhatsApp Cloud API)' : 'off',
    emailOtp: secret && emailConfigured() ? `on (${emailProvider})` : 'off',
    found: { OTP_SECRET: has('OTP_SECRET'), FAST2SMS_API_KEY: has('FAST2SMS_API_KEY'), GMAIL_USER: has('GMAIL_USER'), GMAIL_APP_PASSWORD: has('GMAIL_APP_PASSWORD'), RESEND_API_KEY: has('RESEND_API_KEY'), RESEND_FROM: has('RESEND_FROM'), MSG91_AUTH_KEY: has('MSG91_AUTH_KEY'), TWILIO_ACCOUNT_SID: has('TWILIO_ACCOUNT_SID'), WHATSAPP_TOKEN: has('WHATSAPP_TOKEN'), WHATSAPP_PHONE_NUMBER_ID: has('WHATSAPP_PHONE_NUMBER_ID'), WHATSAPP_TEMPLATE: has('WHATSAPP_TEMPLATE') },
    problems,
    // Which sender each email route uses (host and the account's domain only — no names, no passwords).
    emailSenders: emailSenderInfo(),
    ...(routes ? { emailRoutes: routes } : { tip: 'Add ?check=1 to this address to test the email login for real.' }),
    note: 'Vercel applies new or changed variables only to deployments made after the change — redeploy after editing them.',
  });
}
