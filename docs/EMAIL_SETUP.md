# Email set-up — checklist

KashRoot sends email from one Gmail account, **kashrootsupport@gmail.com**,
through Gmail's SMTP server. Three senders use it:

| What | Who sends it | Settings in |
|---|---|---|
| Help requests, replies, "resolved", payout and sign-in notices (the email queue) | KashRoot's server (`src/lib/server/mail.ts`) | Vercel: `SMTP_*` |
| Codes to confirm a mobile or email in KashRoot's own forms | KashRoot's server (`src/lib/server/otp.ts`) | Vercel: `GMAIL_*` |
| Sign-up confirmation, password reset, email change | Supabase Auth | Supabase: SMTP Settings |

Never write the app password anywhere but the two settings pages below — not in
code, chat, screenshots or a document.

## 1. The Gmail app password (once)

1. Sign in to Google as **kashrootsupport@gmail.com**.
2. Open https://myaccount.google.com/security → **2-Step Verification** → turn it **on** (needed for app passwords).
3. Open https://myaccount.google.com/apppasswords → name it `KashRoot` → **Create**.
4. Google shows 16 letters in 4 groups (`abcd efgh ijkl mnop`). Copy them. You can paste them with or without the spaces (KashRoot removes spaces), but **without** is cleaner.
5. Keep the page open until steps 2 and 3 below are done; Google shows it only once. (Lost it? Delete it there and make a new one.)

## 2. Vercel (KashRoot's server)

Vercel → project **kashroot-web** → **Settings** → **Environment Variables**. For each, tick
**Production**, **Preview** and **Development**, then **Save**:

| Name | Value |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `kashrootsupport@gmail.com` |
| `SMTP_PASS` | the 16-letter app password |
| `GMAIL_USER` | `kashrootsupport@gmail.com` |
| `GMAIL_APP_PASSWORD` | the same 16-letter app password |
| `SUPPORT_EMAIL` | `kashrootsupport@gmail.com` (where help requests go; optional — this is the default) |
| `KYC_DB_SECRET` | already set — the email queue needs it; don't change it |

- **From address:** every email is sent **from** `KashRoot <SMTP_USER>`, i.e. `KashRoot <kashrootsupport@gmail.com>`, with **Reply-To** the same address. Gmail does not allow another From address without extra set-up, so there is no separate from-address variable.
- **Port:** 465 (SSL). If Vercel cannot reach 465, KashRoot tries 587 (STARTTLS) by itself.
- Not needed: `RESEND_API_KEY` / `RESEND_FROM` (leave them unset unless you move codes to Resend).

Then **Deployments** → the latest → **⋯** → **Redeploy** (settings apply only to a new deployment).

## 3. Supabase (sign-up and password-reset emails)

Supabase → your project → **Authentication** → **Emails** → **SMTP Settings** → **Enable custom SMTP**:

| Field | Value |
|---|---|
| Sender email | `kashrootsupport@gmail.com` |
| Sender name | `KashRoot` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `kashrootsupport@gmail.com` |
| Password | the same 16-letter app password |
| Minimum interval between emails | keep the default |

**Save.** (Without custom SMTP, Supabase sends only a few emails an hour from its own address.)

## 4. Check it works

1. Open https://kashroot-web.vercel.app/api/email — expect `"configured":true`,
   `"from":"kashrootsupport@gmail.com"`, `"SMTP_USER_is_support_address":true`,
   `"SMTP_PASS_length":16`, `"SMTP_PASS_has_spaces":false`. (It shows yes/no and a length — never the password.)
2. Open https://kashroot-web.vercel.app/api/email?verify=1 — expect `"login":{"ok":true}`. This logs in to Gmail and out again, and sends nothing (3 checks an hour). `EAUTH 535` means the app password is wrong or 2-Step Verification is off.
3. Sign in to Admin → **Setup check** → **Send test email** → expect "sent"; the test email arrives in kashrootsupport@gmail.com within a minute. The same page shows the email queue (waiting / sent / failed).
4. Send the emails still waiting: open https://kashroot-web.vercel.app/api/email/flush — it answers `{"sent":…,"failed":…}` (10 at a time; open it again until both are 0). Vercel also does this every day at 08:30 India time.
5. The help flow:
   1. Open https://kashroot-web.vercel.app/support, fill in the form with **your personal email**, **Send to KashRoot**.
   2. kashrootsupport@gmail.com gets "KashRoot help request H-…"; your personal inbox gets "We got your request H-…".
   3. Admin → **Help desk** → open that request → write a reply → **Send**. Your inbox gets "Your KashRoot request H-… has a reply".
   4. Mark it **Resolved**. Your inbox gets "Your KashRoot request H-… is resolved".
6. Password reset: https://kashroot-web.vercel.app/forgot-password with your own email → the reset email arrives from KashRoot (Supabase, step 3).
7. Anything missing: check Spam first, then Admin → Security → "Why emails failed" (the mail server's own reply, no passwords).

## Status on 5 Nov 2026 (checked from the live server)

`SMTP_USER` = kashrootsupport@gmail.com ✔ · `SMTP_PASS` 16 letters, no spaces ✔ ·
Gmail login ✔ · queue: nothing waiting that could be sent ·
the help flow worked end to end on a local copy. Still to confirm by hand:
steps 3, 5 and 6 above (they need Admin and real inboxes).
