# KashRoot security

How KashRoot is protected, what the code enforces, and the settings that live
outside the code (Supabase and Vercel dashboards) — set them exactly as below.

## Accounts and sign-in

| What | Where it is enforced |
| --- | --- |
| Passwords hashed | Supabase Auth stores only **bcrypt** hashes; KashRoot never sees or keeps a password. The admin code is bcrypt in the database (`kr_code_bcrypt`). |
| Password strength | Sign-up asks for 8+ characters and warns on weak ones (`lib/auth/passwordRules`); Supabase enforces its own minimum (below). |
| Email verified before sign-in | Supabase **Confirm email** (below); the app also refuses a sign-in without a confirmed email or phone (`lib/api/auth.ts`). |
| Sessions expire | Supabase access tokens last 1 hour and are refreshed; each portal locks after 12 hours unused (`lib/auth/portalAccess`); Admin locks after 15 minutes. |
| Reset links expire | Supabase email links expire (below) and work once. |
| Password guessing | 8 wrong passwords for one account, or 40 from one network, in 15 minutes → sign-in paused 15 minutes — counted across every server instance in the database (`app/api/supabase` proxy, `rate_buckets`). Supabase's own limits stand behind it for anyone calling Supabase directly. |
| Sign-up and email floods | 30 new accounts per network per hour; 4 reset/code emails per address and 20 per network per 15 minutes (shared counts). |
| Bots | Cloudflare Turnstile ("I am human") on sign-in, sign-up, password reset, sending codes and help requests — on when its keys are set (below). |
| Tokens in the browser | Only Supabase's own session; API calls take the token from it (`lib/auth-fetch`). No copy in cookies or elsewhere. |

## Data: every row belongs to someone

* Every table has **row-level security**. The site has no service-role key and
  no direct database connection: every read and write goes through Supabase's
  API **as the signed-in user**, so the database itself checks ownership.
* Functions that act for the server (`kr_*` with `p_secret`) need
  `KYC_DB_SECRET`, which only the KashRoot server has.
* Proven by `supabase/tests` (run `sh supabase/tests/run.sh`, needs Docker):
  an outsider and a signed-out visitor try to read, change and delete every
  row of every table (IDOR sweep), the sensitive tables by hand, and every
  function as a stranger.

## Input

* API routes accept only expected shapes: types, lengths, patterns (IFSC,
  vehicle numbers, mobile numbers, request codes), enumerations; anything else
  gets a 400.
* No SQL is built from text: Supabase/PostgREST and `plpgsql` parameters only.
  No shell commands are run.
* Photos must really be JPEG, PNG or WebP — checked by their first bytes in the
  API (`imageBlock`) and again in the database (`kr_image_ok`), with size caps.
  No SVG or other files are accepted.
* React escapes all text; the one raw HTML block is a fixed JSON-LD constant.
  The Content-Security-Policy allows scripts only from KashRoot (and
  Cloudflare's Turnstile), and data to KashRoot's services only.
* Redirect targets (`next=`) are same-site paths only (`safeNextPath`).

## Abuse and cost limits

Every API route that does work is rate-limited per network (shared across
instances; only the tiny status checks `health`, `kyc/config` and `otp/status`
are not) and the costly ones also per account and per day for the whole site:
AI photo checks (`AI_PHOTO_DAILY_LIMIT`, sign-in required for the portal
ones), the voice (`TTS_DAILY_LIMIT`), SMS/WhatsApp codes, identity checks,
help requests, the assistant.

## Logging and spotting attacks

`lib/server/securityLog` writes one JSON line per event to the server log
(Vercel → Logs, search `kr-security`) and a row in `security_events`:
sign-ins (right and wrong), sign-ups, reset emails, pauses, requests refused
for going too fast, failed bot checks, refused data requests and server errors
(`instrumentation.ts onRequestError`). Networks and accounts are **hashed** —
no IP address, email, phone, password or token is logged. Admin → Security →
"Sign-ins and traffic" shows the last 24 hours and flags a kind driven by one
network. Admin actions are in the separate `security_log`. Kept 30 days.

## Emails

* Every KashRoot email comes from **kashrootsupport@gmail.com** (Vercel
  `SMTP_*`; Supabase → Authentication → SMTP Settings for sign-in emails), and
  says on every page and in every email that KashRoot never asks for a
  password, OTP, UPI PIN or card number. `/official` lists the only official
  addresses.
* Sent from the server only (`lib/server/mail`), queued first in
  `email_outbox` (`20261108000000_email_outbox.sql`): a new help request (to
  the support inbox), a Help desk reply (to the customer, a link only, not the
  reply), payout details saved or changed, password / email / phone changed,
  and a sign-in on a new device (to the account). Failed sends are retried (5
  tries); at most 450 a day for the whole site (Gmail allows about 500). Sent
  or failed is logged (`email_sent`, `email_failed`) without content.
* Emails never carry a password, code, Aadhaar or bank number; a customer's
  words are emailed with anything after "password", "OTP", "PIN" or "code",
  and long numbers, hidden.
* Admin → Setup check → *Send test email* proves it works.

## Secrets

* Only `NEXT_PUBLIC_*` values reach browsers, and only public ones are used
  that way (Supabase URL and anon key, site URL, Turnstile site key). The
  server **refuses to start** if a secret is put in a `NEXT_PUBLIC_` variable
  (`src/instrumentation.ts`).
* All secrets live in Vercel environment variables (see `.env.example`).
  `.env*` files are git-ignored; none has ever been committed.
* If a key is ever exposed: rotate it at its provider first, then update Vercel.

## Threat model (STRIDE)

What could go wrong, area by area: **S**poofing (pretending to be someone),
**T**ampering (changing what is not yours), **R**epudiation (denying what you
did), **I**nformation disclosure (seeing what is not yours), **D**enial of
service / cost abuse, **E**levation of privilege (doing what your role may
not). For each: what protects KashRoot now, and what is missing. Missing
items are the plan; each is built and tested before it is ticked here.
No site is 100% safe — the costs of what is left are at the end.

### Sign-in, sign-up, password reset, codes

| Threat | Protected now | Missing → fix |
| --- | --- | --- |
| S: password guessing / credential stuffing | Shared database limits: 8 wrong per account or 40 per network in 15 min → 15-min pause; Supabase's own limits; Turnstile with Supabase CAPTCHA | Growing delays and a lock **with an email notice**; admin alert on spikes |
| S: bots making accounts | 30 sign-ups per network per hour; Turnstile; email confirmation (Supabase setting) | Honeypot field and minimum fill time; optional disposable-email block |
| S: stolen password | New-device sign-in email; refresh-token reuse detection (Supabase) | **MFA (TOTP)** for admins and money roles; "sign out other devices" |
| S: leaked passwords | 8+ characters, strength hint | Have I Been Pwned range check (k-anonymity) at sign-up and change (Supabase's own check is Pro-only) |
| T: reset link reused / hijacked | Supabase links expire and work once; redirects only to the real site | — |
| I: is this email registered? | Reset says the same either way | Same for sign-up (Supabase answers an existing email without error when confirmation is on) — verify |
| D: email / code floods | 4 emails per address, 20 per network per 15 min; codes cost money so they need Turnstile | — |

### Every API route and database function (RPC)

| Threat | Protected now | Missing → fix |
| --- | --- | --- |
| S: calling an API as someone else | Bearer token checked by Supabase; server functions need `KYC_DB_SECRET` | — |
| T/E: changing other people's rows | RLS on every table; IDOR sweep test (`supabase/tests/20_idor_every_table.sql`) | Re-run on every new table (CI) |
| E: admin functions without MFA | `kr_has_role('ADMIN')` in the database; admin access code (bcrypt) | Admin and money functions also require **AAL2** (MFA) in the database |
| T: injection | No SQL from text; PostgREST / plpgsql parameters only; strict input shapes | — |
| D: floods and cost | Per-network limits on every working route; per-account and site-wide daily caps on AI, voice, photo checks, codes | Request-size limits written down per route; Vercel Firewall rate rule on `/api/*` |
| S: forged cross-site requests (CSRF) | Tokens are sent as `Authorization` headers, not cookies (a form on another site cannot send them); cookies are SameSite=Lax | Origin check on the few cookie-only routes (`/api/human` pass) |

### Database, storage and photos

| Threat | Protected now | Missing → fix |
| --- | --- | --- |
| I: reading others' data | RLS; phones hidden from signed-out visitors; no service-role key on the site | — |
| T: a disguised file as a "photo" | First bytes must be JPEG / PNG / WebP (API and `kr_image_ok`); no SVG; size caps | **Strip EXIF location** from photos before storing |
| R: "I never changed that" | Admin actions in `security_log`; security events (hashed) | An **append-only audit log** (who, what, when, before/after) nobody can edit — with the Super Admin work |

### Admin and Super Admin

| Threat | Protected now | Missing → fix |
| --- | --- | --- |
| S: someone using the admin portal | Admin role in the database; access code; 15-min lock; Admin hidden from the public | **MFA (TOTP) + marked device**; only kashroot08@gmail.com can be Super Admin, set by SQL only |
| E: staff doing more than their job | One ADMIN role today | Staff Admin with ticked permissions; Business Owner / Manager / Staff per business (RLS) |
| S: support changing someone's email or bank details "on request" | No admin tool can (payout rows are the owner's own) | Keep it so, with a test |

### Payments and bank details (KashRoot never holds money)

| Threat | Protected now | Missing → fix |
| --- | --- | --- |
| T/S: changing someone's UPI / bank details | Only the owner (RLS); KYC first; email notice on every change | Password + MFA re-check; 24-hour hold before payouts use new details; warning to payers |
| I: account numbers seen | Receipts keep only the last 4 digits | — |

### AI, voice and other outside services

| Threat | Protected now | Missing → fix |
| --- | --- | --- |
| D: cost abuse | "I am human" pass; per-account and site-wide daily caps | Admin alert when a cap is reached |
| E: the assistant doing things for you | It answers and navigates; it takes no actions | Any future action needs a confirm tap and re-authentication; never by voice alone |
| SSRF: the server fetching a URL someone gave | Outside calls go to fixed hosts only (Supabase, Cloudflare, Agmarknet, Open-Meteo, mail) | A test that no route takes a URL from a request |

### Web attacks in the browser

| Threat | Protected now | Missing → fix |
| --- | --- | --- |
| XSS | React escaping; the only raw HTML is a fixed JSON-LD block; CSP (scripts from KashRoot and Cloudflare only) | Attack test with script payloads in every text field |
| Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | — |
| Open redirects | `next=` only same-site paths (`safeNextPath`) | Attack test |
| Path tricks on the Supabase proxy | Only `auth/v1` and `rest/v1`; no `..` or encoded slashes | Attack test |
| Fake copies of the site | One address (src/proxy.ts); Turnstile only on the real address; `/support` → Official contacts | — |

### Build, dependencies and secrets

| Threat | Protected now | Missing → fix |
| --- | --- | --- |
| T: a bad package update | `package-lock.json` committed | **Dependabot**; CI with `npm audit`, tsc, eslint, build; remove unused packages |
| I: a secret in code or history | Secrets only in Vercel; the server refuses to start with a secret in `NEXT_PUBLIC_*`; GitHub secret scanning (setting) | **gitleaks** in CI and a pre-commit hook; a key-rotation guide |

### What is left, and what it would cost

| Risk | Needs | Cost (approx.) |
| --- | --- | --- |
| Leaked-password check inside Supabase | Supabase Pro (until then, our own HIBP check) | US$25 a month |
| Large automated attacks on `/api/*` | Vercel Pro (more Firewall rules, Attack Challenge, longer logs) | US$20 a month per member |
| Sending more than ~500 emails a day, or from @kashroot.in | A sending service (Resend, Brevo) and a domain with SPF / DKIM / DMARC | Domain ~₹800 a year; free tiers start at 3,000 emails a month |
| Database backups older than 7 days, point-in-time restore | Supabase Pro (+ PITR add-on) | from US$25 a month |

## Settings outside the code — set these

**Supabase → Authentication**
* Sign In / Providers → Email: **Confirm email ON**; *Secure email change* ON;
  *Secure password change* ON.
* Passwords: minimum length **8**, require letters and digits; **Leaked
  password protection ON** (Pro plan).
* Sessions: *Detect and revoke compromised refresh tokens* ON; refresh token
  reuse interval 10 s. Access token (JWT) expiry **3600** s. On the Pro plan
  also set *Inactivity timeout* (e.g. 7 days).
* Emails: *Email OTP / link expiration* **3600** s or less.
* Rate Limits: keep the defaults or lower (emails per hour, sign-ups and
  sign-ins per 5 minutes per IP, token verifications).
* Attack Protection → **Enable CAPTCHA protection**, provider **Turnstile**,
  secret = your Turnstile secret key. Set it at the same time as
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Vercel and
  redeploy — the forms send the token only when the site key is set.
* URL Configuration: Site URL = the live address; Redirect URLs = only
  `https://<live address>/**`.

**Supabase → Database**
* Settings → **Enforce SSL** on incoming connections ON.
* Settings → **Network Restrictions**: allow only the addresses that must
  reach Postgres directly (none, for the website — it uses the API); add your
  own address only while you need psql, then remove it.
* Never share the database password or the service-role / secret key; KashRoot
  does not need them.

**Cloudflare Turnstile** (free): add a widget for the live domain, mode
*Managed*; put the site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the secret
in `TURNSTILE_SECRET_KEY` (and in Supabase CAPTCHA, above).

**Vercel**
* Domains: HTTPS is automatic; the site sends HSTS (2 years) and upgrades any
  insecure request.
* Environment variables: secrets only as non-`NEXT_PUBLIC_` variables, for
  Production (and Preview only if needed). Turn on *Deployment Protection* for
  preview deployments.
* Turn on **Vercel Firewall** bot protection / Attack Challenge Mode during an
  attack; Logs → search `kr-security`.

**GitHub**
* Settings → Code security → **Secret scanning** and **Push protection** ON.
* Protect `main` (pull requests or required checks).

## Reporting a problem

Email kashrootsupport@gmail.com with "Security" in the subject. Please do not test
against real users' accounts or data.
