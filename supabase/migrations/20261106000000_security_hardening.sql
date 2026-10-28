-- KashRoot: security hardening.
--   1. kr_rate_peek: read a shared rate-limit count without adding to it, so
--      wrong passwords can be counted across every server instance
--      (lib/server/sharedLimit, app/api/supabase proxy).
--   2. security_events: what the server saw — sign-ins (right and wrong),
--      sign-ups, reset emails, requests refused for going too fast, API errors —
--      with the network and account only as hashes (never an IP address, email
--      or phone). Written only by the KashRoot server (KYC_DB_SECRET); read only
--      by admins (Admin → Security). Kept 30 days.
--   3. kr_image_ok: an uploaded photo must really be a JPEG, PNG or WebP
--      image (its first bytes are checked, not just its name), so no SVG or
--      other file with script can be stored as a "photo". Used by every photo
--      column; rows already saved are not re-checked until they are changed.
-- Run after 20261105000000_support_desk.sql. Safe to run again.

-- ── 1. Read a shared count ──
create or replace function public.kr_rate_peek(p_secret text, p_key text, p_window integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  s text;
  n integer;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then return 0; end if;
  select case when started_at < now() - make_interval(secs => p_window) then 0 else hits end into n
    from public.rate_buckets where key = p_key;
  return coalesce(n, 0);
end $$;
revoke all on function public.kr_rate_peek(text, text, integer) from public;
grant execute on function public.kr_rate_peek(text, text, integer) to anon, authenticated;

-- A count back to nothing (a right password clears the wrong ones before it).
create or replace function public.kr_rate_clear(p_secret text, p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then return false; end if;
  delete from public.rate_buckets where key = p_key;
  return true;
end $$;
revoke all on function public.kr_rate_clear(text, text) from public;
grant execute on function public.kr_rate_clear(text, text) to anon, authenticated;

-- ── 2. Security events ──
create table if not exists public.security_events (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  kind       text not null check (kind in ('signin_ok', 'signin_fail', 'signin_paused', 'signup', 'signup_paused', 'reset_email', 'email_paused', 'rate_limited', 'api_error', 'bot_check_failed', 'forbidden')),
  ip_hash    text check (ip_hash is null or char_length(ip_hash) <= 40),
  actor_hash text check (actor_hash is null or char_length(actor_hash) <= 40),
  path       text check (path is null or char_length(path) <= 120),
  status     integer,
  detail     text check (detail is null or char_length(detail) <= 300)
);
create index if not exists security_events_at on public.security_events (at desc);
create index if not exists security_events_kind on public.security_events (kind, at desc);
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;
drop policy if exists "Admins read security events" on public.security_events;
create policy "Admins read security events" on public.security_events for select to authenticated using (public.kr_has_role('ADMIN'));

create or replace function public.kr_log_event(p_secret text, p_kind text, p_ip text, p_actor text, p_path text, p_status integer, p_detail text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then return false; end if;
  insert into public.security_events (kind, ip_hash, actor_hash, path, status, detail)
  values (p_kind, left(p_ip, 40), left(p_actor, 40), left(p_path, 120), p_status, left(p_detail, 300));
  -- Now and then: older than 30 days goes.
  if random() < 0.01 then delete from public.security_events where at < now() - interval '30 days'; end if;
  return true;
exception when check_violation then
  return false;
end $$;
revoke all on function public.kr_log_event(text, text, text, text, text, integer, text) from public;
grant execute on function public.kr_log_event(text, text, text, text, text, integer, text) to anon, authenticated;

-- Admin → Security: the last `p_hours` at a glance — how many of each kind, and
-- the networks (hashed) refused or failing most, to spot a bot or a guessing attack.
create or replace function public.kr_security_summary(p_hours integer default 24)
returns table (kind text, events bigint, networks bigint, top_network text, top_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only KashRoot admins can see this.' using errcode = '42501'; end if;
  return query
    with recent as (select * from public.security_events e where e.at > now() - make_interval(hours => least(greatest(p_hours, 1), 720))),
    per as (select r.kind, r.ip_hash, count(*) as n from recent r group by r.kind, r.ip_hash),
    top as (select distinct on (p.kind) p.kind, p.ip_hash, p.n from per p order by p.kind, p.n desc)
    select r.kind, count(*)::bigint, count(distinct r.ip_hash)::bigint, t.ip_hash, t.n::bigint
      from recent r left join top t on t.kind = r.kind
     group by r.kind, t.ip_hash, t.n
     order by count(*) desc;
end $$;
revoke all on function public.kr_security_summary(integer) from public, anon;
grant execute on function public.kr_security_summary(integer) to authenticated;

-- ── 3. Photos must be real images ──
create or replace function public.kr_image_ok(p text, p_max integer default 600000) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  head bytea;
begin
  if p is null then return true; end if;
  if char_length(p) > p_max or p !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]{16}' then return false; end if;
  begin
    head := decode(substr(p, position(',' in p) + 1, 16), 'base64');
  exception when others then
    return false;
  end;
  return substring(head from 1 for 3) = '\xffd8ff'::bytea                                                  -- JPEG
      or substring(head from 1 for 8) = '\x89504e470d0a1a0a'::bytea                                        -- PNG
      or (substring(head from 1 for 4) = '\x52494646'::bytea and substring(head from 9 for 4) = '\x57454250'::bytea); -- WebP
end $$;

create or replace function public.kr_photos_ok(p text[]) returns boolean
language sql immutable set search_path = public as $$
  select p is null or (
    cardinality(p) <= 3
    and not exists (select 1 from unnest(p) x where x is null or not public.kr_image_ok(x, 600000))
  )
$$;

create or replace function public.kr_store_photos_ok(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select p is null or (
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) <= 8
    and not exists (
      select 1 from jsonb_array_elements(p) x
      where jsonb_typeof(x) <> 'object'
         or jsonb_typeof(x -> 'src') is distinct from 'string'
         or not public.kr_image_ok(x ->> 'src', 460000)
         or (x ? 'note' and jsonb_typeof(x -> 'note') not in ('string', 'null'))
         or char_length(coalesce(x ->> 'note', '')) > 80
    )
  )
$$;

-- The single-photo columns: checked for every new or changed photo (not valid = old rows are not re-read now).
alter table public.advisory_requests drop constraint if exists advisory_requests_photo_image;
alter table public.advisory_requests add constraint advisory_requests_photo_image check (public.kr_image_ok(photo)) not valid;
alter table public.market_listings drop constraint if exists market_listings_photo_image;
alter table public.market_listings add constraint market_listings_photo_image check (public.kr_image_ok(photo)) not valid;
alter table public.role_requests drop constraint if exists role_requests_id_photo_image;
alter table public.role_requests add constraint role_requests_id_photo_image check (public.kr_image_ok(id_photo)) not valid;

notify pgrst, 'reload schema';
