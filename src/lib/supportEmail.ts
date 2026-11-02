/**
 * KashRoot's one official email address: the address every KashRoot email
 * comes from (and replies go to). On the site it is shown only inside Help &
 * support (its "Official contacts", as an "Email us" button) — everywhere
 * else points to Help & support. A public value, so the browser may read it;
 * the server's SUPPORT_EMAIL (Vercel) wins there.
 */
export const SUPPORT_EMAIL = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'kashrootsupport@gmail.com').toLowerCase();

/** A mailto: link with a subject line ready. */
export const supportMailto = (subject = 'KashRoot Support Request') => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

/** The anti-phishing line, said the same way everywhere. */
export const NEVER_ASKS = 'KashRoot never asks for your password, OTP, UPI PIN or card number — not by call, SMS, WhatsApp or email.';
