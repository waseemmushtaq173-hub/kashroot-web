-- KashRoot: the security gate (lib/server/gate, components/security/SecurityGate) —
-- every sign-in, sign-up, reset and help form shows only after the "I am human"
-- check. Each pass is logged as "gate_passed" (with where), so Admin → Security
-- counts passes and failures per portal. Nothing else changes in the database.
-- Run after 20261111000000_admin_mfa.sql. Safe to run again.

alter table public.security_events drop constraint if exists security_events_kind_check;
alter table public.security_events add constraint security_events_kind_check check (kind in (
  'signin_ok', 'signin_fail', 'signin_paused', 'signup', 'signup_paused', 'reset_email', 'email_paused',
  'rate_limited', 'api_error', 'bot_check_failed', 'forbidden', 'email_sent', 'email_failed', 'gate_passed'));


notify pgrst, 'reload schema';
