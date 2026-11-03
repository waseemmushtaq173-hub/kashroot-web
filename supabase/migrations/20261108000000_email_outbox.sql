-- KashRoot: emails from the support address (kashrootsupport@gmail.com),
-- sent by the KashRoot server (lib/server/mail) and queued here first, so a
-- failed send is tried again and the whole site stays under Gmail's daily
-- limit (about 500): at most 450 are sent in any 24 hours.
--   email_outbox  one email to send: what kind, to whom (the support inbox, an
--                 account, or the address a help request gave), and its
--                 progress (pending → sent, or failed after 5 tries).
-- What queues one:
--   * a new help request             → the support inbox (trigger)
--   * KashRoot replies in Help desk  → the customer, when they gave an email (trigger)
--   * payout (bank / UPI) details saved or changed → the account (trigger)
--   * password, email or phone changed, a sign-in on a new device → the
--     account (the server, kr_email_enqueue)
-- No email body is kept: only the kind, a reference (a request's code) and a
-- short note (e.g. "Chrome on Android"). Never a password, code, Aadhaar or
-- bank number. Only the KashRoot server queues, takes and marks emails
-- (KYC_DB_SECRET); admins see the counts (Admin → Setup check). Nobody reads
-- or writes the table directly. Sent rows go after 30 days.
-- Also: security_events accepts "email_sent" and "email_failed".
-- Run after 20261107000000_private_phones.sql. Safe to run again.

create table if not exists public.email_outbox (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('help_new', 'help_reply', 'payout_changed', 'password_changed', 'email_changed', 'phone_changed', 'new_signin')),
  user_id     uuid references auth.users (id) on delete cascade,
  to_email    text check (to_email is null or char_length(to_email) <= 120),
  ref         text check (ref is null or char_length(ref) <= 40),
  detail      text check (detail is null or char_length(detail) <= 80),
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts    integer not null default 0,
  next_try_at timestamptz not null default now(),
  last_error  text check (last_error is null or char_length(last_error) <= 120),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists email_outbox_due on public.email_outbox (status, next_try_at);
create index if not exists email_outbox_sent on public.email_outbox (sent_at) where status = 'sent';
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

-- ── What queues an email ──
create or replace function public.kr_email_on_help() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_outbox (kind, ref) values ('help_new', new.code);
  return new;
end $$;
drop trigger if exists support_requests_email on public.support_requests;
create trigger support_requests_email after insert on public.support_requests for each row execute function public.kr_email_on_help();

create or replace function public.kr_email_on_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.support_requests;
begin
  if new.author <> 'kashroot' then return new; end if;
  select * into r from public.support_requests where id = new.request_id;
  if r.email is null then return new; end if;
  -- Several replies before the email goes out: one email.
  if exists (select 1 from public.email_outbox where kind = 'help_reply' and ref = r.code and status = 'pending') then return new; end if;
  insert into public.email_outbox (kind, to_email, ref) values ('help_reply', r.email, r.code);
  return new;
end $$;
drop trigger if exists support_messages_email on public.support_messages;
create trigger support_messages_email after insert on public.support_messages for each row execute function public.kr_email_on_reply();

create or replace function public.kr_email_on_payout() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.upi_id is not distinct from old.upi_id and new.account_number is not distinct from old.account_number
     and new.ifsc is not distinct from old.ifsc and new.account_name is not distinct from old.account_name then
    return new;
  end if;
  insert into public.email_outbox (kind, user_id) values ('payout_changed', new.user_id);
  return new;
end $$;
drop trigger if exists payout_accounts_email on public.payout_accounts;
create trigger payout_accounts_email after insert or update on public.payout_accounts for each row execute function public.kr_email_on_payout();

-- ── The KashRoot server ──
-- A security notice for an account (the server saw the change go through Supabase).
create or replace function public.kr_email_enqueue(p_secret text, p_kind text, p_user uuid, p_detail text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('password_changed', 'email_changed', 'phone_changed', 'new_signin') then raise exception 'unknown kind'; end if;
  if not exists (select 1 from auth.users where id = p_user) then return false; end if;
  insert into public.email_outbox (kind, user_id, detail) values (p_kind, p_user, left(p_detail, 80));
  return true;
end $$;
revoke all on function public.kr_email_enqueue(text, text, uuid, text) from public;
grant execute on function public.kr_email_enqueue(text, text, uuid, text) to anon, authenticated;

-- Take up to p_limit emails that are due, with their addresses; each is
-- held for 10 minutes (tried again then if it was never marked). Within the
-- daily allowance only. A help request's details come with "help_new".
create or replace function public.kr_email_claim(p_secret text, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s text;
  allowance integer;
  out jsonb;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  if random() < 0.05 then delete from public.email_outbox where status in ('sent', 'failed') and created_at < now() - interval '30 days'; end if;
  allowance := greatest(0, 450 - (select count(*) from public.email_outbox where status = 'sent' and sent_at > now() - interval '24 hours')::integer);
  with due as (
    select o.id from public.email_outbox o
    where o.status = 'pending' and o.next_try_at <= now()
    order by o.id
    limit least(greatest(coalesce(p_limit, 0), 0), 20, allowance)
    for update skip locked
  ), held as (
    update public.email_outbox o set attempts = o.attempts + 1, next_try_at = now() + interval '10 minutes'
    from due where o.id = due.id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'kind', h.kind, 'ref', h.ref, 'detail', h.detail, 'attempts', h.attempts, 'created_at', h.created_at,
    'to', case when h.kind = 'help_new' then null when h.user_id is not null then u.email else h.to_email end,
    'help', case when h.kind = 'help_new' then (
      select jsonb_build_object('name', r.name, 'phone', r.phone, 'email', r.email, 'topic', r.topic, 'portal', r.portal, 'lang', r.lang, 'message', r.message, 'signed_in', r.user_id is not null)
      from public.support_requests r where r.code = h.ref) end
  ) order by h.id), '[]'::jsonb)
  into out
  from held h left join auth.users u on u.id = h.user_id;
  return out;
end $$;
revoke all on function public.kr_email_claim(text, integer) from public;
grant execute on function public.kr_email_claim(text, integer) to anon, authenticated;

-- Mark one sent, or failed this time (tried again later; given up after 5 tries).
create or replace function public.kr_email_done(p_secret text, p_id bigint, p_ok boolean, p_error text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_ok then
    update public.email_outbox set status = 'sent', sent_at = now(), last_error = null where id = p_id;
  else
    update public.email_outbox
       set status = case when attempts >= 5 then 'failed' else 'pending' end,
           next_try_at = now() + make_interval(mins => 2 * attempts * attempts),
           last_error = left(p_error, 120)
     where id = p_id;
  end if;
  return found;
end $$;
revoke all on function public.kr_email_done(text, bigint, boolean, text) from public;
grant execute on function public.kr_email_done(text, bigint, boolean, text) to anon, authenticated;

-- Admin → Setup check: how the queue stands (counts only).
create or replace function public.kr_email_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only KashRoot admins can see this' using errcode = '42501'; end if;
  return jsonb_build_object(
    'waiting', (select count(*) from public.email_outbox where status = 'pending'),
    'failed_24h', (select count(*) from public.email_outbox where status = 'failed' and created_at > now() - interval '24 hours'),
    'sent_24h', (select count(*) from public.email_outbox where status = 'sent' and sent_at > now() - interval '24 hours'),
    'last_error', (select last_error from public.email_outbox where last_error is not null order by id desc limit 1));
end $$;
revoke all on function public.kr_email_status() from public, anon;
grant execute on function public.kr_email_status() to authenticated;

-- ── The security log takes the email outcomes too ──
alter table public.security_events drop constraint if exists security_events_kind_check;
-- The one complete list (the same in every migration that sets it, newest: 20261112000000_security_gate.sql),
-- so RUN_THIS_ONCE.sql can be run again on a database that already holds every kind.
alter table public.security_events add constraint security_events_kind_check check (kind in (
  'signin_ok', 'signin_fail', 'signin_paused', 'signup', 'signup_paused', 'reset_email', 'email_paused',
  'rate_limited', 'api_error', 'bot_check_failed', 'forbidden', 'email_sent', 'email_failed', 'gate_passed'));

notify pgrst, 'reload schema';
