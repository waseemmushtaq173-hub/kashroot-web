/**
 * KashRoot's one official email address — shown wherever help is offered
 * (footer, Help & support, /official, terms, privacy, error messages, the
 * assistant) and the address every KashRoot email comes from. A public value,
 * so the browser may read it; the server's SUPPORT_EMAIL (Vercel) wins there.
 */
export const SUPPORT_EMAIL = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'kashrootsupport@gmail.com').toLowerCase();

/** A mailto: link with a subject line ready. */
export const supportMailto = (subject = 'KashRoot Support Request') => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

/** The anti-phishing line, said the same way everywhere. */
export const NEVER_ASKS = `KashRoot never asks for your password, OTP, UPI PIN or card number — not by call, SMS, WhatsApp or email. KashRoot's only email address is ${SUPPORT_EMAIL}.`;
