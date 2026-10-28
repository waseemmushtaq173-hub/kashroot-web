-- KashRoot: rate limits shared by every server instance (lib/server/sharedLimit).
-- Each Vercel instance used to count only its own requests, so a burst spread
-- over instances got several times the limit. Now the count is kept here:
--   rate_buckets  key (e.g. "otp-send:phone:98…" or "photo-day:all"), the
--                 window it counts in, and how many so far.
-- kr_rate_hit counts one request and says whether the limit is passed. Only
-- the KashRoot server calls it (KYC_DB_SECRET in Vercel); nobody can read or
-- change the table. Keys are hashed by the server, so no phone number or
-- email is kept here. Old windows are cleared as it goes.
-- Run after 20261102000000_assistant_answers.sql. Safe to run again.

create table if not exists public.rate_buckets (
  key        text primary key check (char_length(key) between 1 and 200),
  started_at timestamptz not null,
  hits       integer not null default 0
);
create index if not exists rate_buckets_started on public.rate_buckets (started_at);
alter table public.rate_buckets enable row level security;
revoke all on public.rate_buckets from anon, authenticated;

-- True when this request is over `p_max` in the window of `p_window` seconds.
create or replace function public.kr_rate_hit(p_secret text, p_key text, p_max integer, p_window integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
  n integer;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  -- Without the server's secret nothing is counted (and nothing is refused).
  if s is null or p_secret is null or p_secret <> s then return false; end if;
  if p_key is null or char_length(p_key) not between 1 and 200 or p_max < 1 or p_window not between 1 and 86400 then return false; end if;
  insert into public.rate_buckets as b (key, started_at, hits) values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when b.started_at < now() - make_interval(secs => p_window) then 1 else b.hits + 1 end,
        started_at = case when b.started_at < now() - make_interval(secs => p_window) then now() else b.started_at end
  returning hits into n;
  -- Now and then: windows that ended over a day ago.
  if random() < 0.02 then delete from public.rate_buckets where started_at < now() - interval '1 day 1 hour'; end if;
  return n > p_max;
end $$;
revoke all on function public.kr_rate_hit(text, text, integer, integer) from public;
grant execute on function public.kr_rate_hit(text, text, integer, integer) to anon, authenticated;

notify pgrst, 'reload schema';
