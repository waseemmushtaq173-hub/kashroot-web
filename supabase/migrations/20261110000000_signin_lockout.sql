-- KashRoot: an email notice when sign-in to an account is paused or locked
-- for wrong passwords (app/api/supabase proxy: 8 wrong in 15 min → paused
-- 15 min; 15 wrong in 24 h → locked 1 hour). The KashRoot server queues it
-- by the email that was typed (kr_email_enqueue_email); when no account has
-- that email nothing is queued, and the answer is the same either way, so
-- the lock cannot be used to find out which emails have accounts.
-- Run after 20261109000000_support_tracking.sql. Safe to run again.

alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'help_new', 'help_ack', 'help_reply', 'help_resolved', 'payout_changed', 'password_changed', 'email_changed', 'phone_changed', 'new_signin', 'signin_locked', 'team_changed', 'trip_lost'));

create or replace function public.kr_email_enqueue_email(p_secret text, p_kind text, p_email text, p_detail text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
  uid uuid;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('signin_locked') then raise exception 'unknown kind'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if uid is not null then
    insert into public.email_outbox (kind, user_id, detail) values (p_kind, uid, left(p_detail, 80));
  end if;
  -- The same answer whether or not there is such an account.
  return true;
end $$;
revoke all on function public.kr_email_enqueue_email(text, text, text, text) from public;
grant execute on function public.kr_email_enqueue_email(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
