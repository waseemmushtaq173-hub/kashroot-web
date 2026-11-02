/**
 * What KashRoot's emails say (lib/server/mail sends them): one letter per
 * queued kind (20261108000000_email_outbox.sql), as plain text and simple
 * HTML, each ending with the anti-phishing line. No secrets here and nothing
 * sent from here, so it can be tested on its own (tests/email.spec.ts).
 */
import { NEVER_ASKS } from '@/lib/supportEmail';

export interface Letter {
  to: string;
  subject: string;
  /** Plain-text lines; the HTML version is made from them. */
  lines: string[];
  /** A button: words and link. */
  action?: { label: string; href: string };
  replyTo?: string;
}

export interface Queued {
  id: number;
  kind: 'help_new' | 'help_ack' | 'help_reply' | 'help_resolved' | 'payout_changed' | 'password_changed' | 'email_changed' | 'phone_changed' | 'new_signin';
  ref: string | null;
  detail: string | null;
  created_at: string;
  to: string | null;
  help: { name: string; phone: string; email: string | null; topic: string; portal: string | null; lang: string; message: string; signed_in: boolean } | null;
  /** help_reply: KashRoot's latest reply, word for word. */
  reply?: string | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function render(l: Letter): { text: string; html: string } {
  const text = [...l.lines, ...(l.action ? ['', `${l.action.label}: ${l.action.href}`] : []), '', '—', NEVER_ASKS].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1e293b;max-width:560px">
<p style="font-size:18px;font-weight:bold;color:#14532d;margin:0 0 12px">KashRoot</p>
${l.lines.map((line) => (line ? `<p style="margin:0 0 8px">${esc(line)}</p>` : '<br>')).join('\n')}
${l.action ? `<p style="margin:16px 0"><a href="${esc(l.action.href)}" style="background:#14532d;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">${esc(l.action.label)}</a></p>` : ''}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
<p style="font-size:13px;color:#475569">${esc(NEVER_ASKS)}</p>
</div>`;
  return { text, html };
}

/**
 * A customer's words, safe for an email: the word after "password" is
 * hidden, and after "OTP", "PIN" or "code" when it has a digit in it ("the
 * code does not come" stays as it is); so is any long number (Aadhaar, a bank
 * account) — except a 10-digit mobile number. The Help desk shows the full text.
 */
export function redactForEmail(text: string): string {
  return text
    .replace(/(?<![\p{L}\p{M}])(password|passcode|पासवर्ड|پاس ورڈ)(?![\p{L}\p{M}])(\s*(?:is|was|=|:|-|है|ہے)?\s*)(\S+)/giu, '$1$2[hidden]')
    .replace(/(?<![\p{L}\p{M}])(otp|pin|code|ओटीपी|पिन|कोड|کوڈ)(?![\p{L}\p{M}])(\s*(?:is|was|=|:|-|है|ہے)?\s*)(\S*\d\S*)/giu, '$1$2[hidden]')
    .replace(/\d[\d\s-]{7,}\d/g, (run) => {
      const digits = run.replace(/\D/g, '');
      if (digits.length === 10 && /^[6-9]/.test(digits)) return run;
      return digits.length >= 9 ? '[number hidden]' : run;
    });
}

const TOPIC: Record<string, string> = { login: 'Signing in', payment: 'Payment', order: 'An order', cold_storage: 'Cold storage', selling: 'Selling', other: 'Something else' };

const NOTICE: Record<Exclude<Queued['kind'], 'help_new' | 'help_ack' | 'help_reply' | 'help_resolved'>, [string, (detail: string | null) => string]> = {
  payout_changed: ['Your KashRoot payout details were changed', () => 'The UPI ID or bank account where people pay you was saved or changed on KashRoot.'],
  password_changed: ['Your KashRoot password was changed', () => 'The password of your KashRoot account was changed.'],
  email_changed: ['A change of your KashRoot email was asked for', () => 'Someone signed in to your KashRoot account asked to change its email address. It changes only after the link sent to the new address is opened.'],
  phone_changed: ['Your KashRoot phone number was changed', () => 'The phone number of your KashRoot account was changed.'],
  new_signin: ['New sign-in to your KashRoot account', (d) => `Your KashRoot account was signed in to on a new device${d ? `: ${d}` : ''}.`],
};

const indiaTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

/** The email for one queued item; null when it has nowhere to go. `site` is the site's address, `inbox` the support inbox. */
export function letterFor(q: Queued, site: string, inbox: string): Letter | null {
  const check = { label: 'Check my request', href: `${site}/support?code=${encodeURIComponent(q.ref ?? '')}#check-title` };
  const about = q.help ? (TOPIC[q.help.topic] ?? q.help.topic) : '';
  if (q.kind === 'help_new') {
    const h = q.help;
    if (!h) return null;
    return {
      to: inbox,
      replyTo: h.email ?? undefined,
      subject: `KashRoot help request ${q.ref} — ${TOPIC[h.topic] ?? h.topic}`,
      lines: [
        `A new help request: ${q.ref}`,
        `Received: ${indiaTime(q.created_at)} (India time)`,
        '',
        `Name: ${h.name}`,
        `Mobile (call back): ${h.phone}`,
        `Email: ${h.email ?? 'not given'}`,
        `About: ${TOPIC[h.topic] ?? h.topic}${h.portal ? ` (from the ${h.portal} portal)` : ''}`,
        `Language: ${h.lang}`,
        `Signed in: ${h.signed_in ? 'yes' : 'no'}`,
        '',
        'In their words (passwords, codes and long numbers hidden):',
        redactForEmail(h.message),
      ],
      action: { label: 'Open the Help desk', href: `${site}/admin/dashboard?tab=help` },
    };
  }
  if (!q.to) return null;
  if (q.kind === 'help_ack') {
    return {
      to: q.to,
      subject: `We got your request ${q.ref}`,
      lines: [
        `Thank you — KashRoot got your help request ${q.ref}${about ? ` (${about})` : ''}.`,
        'A person from KashRoot’s team will reply, or call you on the mobile number you gave.',
        'You can see where it stands any time: open Help & support → Check my request, with this number and your mobile number or this email address.',
      ],
      action: check,
    };
  }
  if (q.kind === 'help_reply') {
    return {
      to: q.to,
      subject: `Your KashRoot request ${q.ref} has a reply`,
      lines: [`KashRoot replied to your help request ${q.ref}:`, '', q.reply?.trim() || '(Open your request to read the reply.)', '', 'To answer, or to say whether this solved your problem, open your request:'],
      action: check,
    };
  }
  if (q.kind === 'help_resolved') {
    return {
      to: q.to,
      subject: `Your KashRoot request ${q.ref} is resolved`,
      lines: [`KashRoot marked your help request ${q.ref}${about ? ` (${about})` : ''} as resolved.`, 'If you still need help, open your request and tap “Still need help” — it opens again.'],
      action: check,
    };
  }
  const [subject, line] = NOTICE[q.kind];
  return {
    to: q.to,
    subject,
    lines: [line(q.detail), `When: ${indiaTime(q.created_at)} (India time).`, '', 'If this was you, there is nothing to do.', `If it was not you: change your password now (Forgot password on the sign-in page), then tell KashRoot through Help & support: ${site}/support`],
    action: { label: 'Change my password', href: `${site}/forgot-password` },
  };
}

/** "Chrome on Android, Srinagar": from the browser's own description and the city Vercel guesses (header x-vercel-ip-city). */
export function deviceName(userAgent: string, cityHeader: string | null): string {
  const ua = userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  let city = '';
  try {
    city = decodeURIComponent(cityHeader ?? '').replace(/[^\p{L}\p{M} .'-]/gu, '').trim().slice(0, 30);
  } catch {
    city = '';
  }
  return `${browser}${os ? ` on ${os}` : ''}${city ? `, ${city}` : ''}`;
}
