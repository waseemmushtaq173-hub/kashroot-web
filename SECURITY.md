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

## Secrets

* Only `NEXT_PUBLIC_*` values reach browsers, and only public ones are used
  that way (Supabase URL and anon key, site URL, Turnstile site key). The
  server **refuses to start** if a secret is put in a `NEXT_PUBLIC_` variable
  (`src/instrumentation.ts`).
* All secrets live in Vercel environment variables (see `.env.example`).
  `.env*` files are git-ignored; none has ever been committed.
* If a key is ever exposed: rotate it at its provider first, then update Vercel.

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

Email support@kashroot.com with "Security" in the subject. Please do not test
against real users' accounts or data.
