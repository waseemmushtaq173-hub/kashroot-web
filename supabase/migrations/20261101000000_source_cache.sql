-- KashRoot: the last good answer from each outside source (weather from
-- Open-Meteo, mandi prices from Agmarknet / data.gov.in, the NHB and
-- OpenStreetMap cold store lists), kept with the time it was read. When a
-- source is down, the site shows this copy with "last updated …" instead of
-- an error. Shared by every server instance and kept across deployments.
--   source_cache  key (e.g. "mandi:Jammu And Kashmir|Apple"), body, fetched_at
-- Only the KashRoot server writes or reads it: both functions need the
-- server's secret (KYC_DB_SECRET in Vercel, made by kr_kyc_secret() in
-- 20261014000000_trust_and_security.sql). No table access for anyone.
-- Public data only; weather is kept by place rounded to about 1 km, never a
-- person's exact position. Rows unused for 30 days go; at most 5,000 rows.
-- Run after 20261031000000_setup_check.sql. Safe to run again.

create table if not exists public.source_cache (
  key        text primary key check (char_length(key) between 1 and 200),
  body       jsonb not null,
  fetched_at timestamptz not null,
  saved_at   timestamptz not null default now()
);
create index if not exists source_cache_saved_at on public.source_cache (saved_at);
alter table public.source_cache enable row level security;
revoke all on public.source_cache from anon, authenticated;

create or replace function public.kr_cache_put(p_secret text, p_key text, p_body jsonb, p_fetched_at timestamptz) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then return false; end if;
  if p_key is null or char_length(p_key) not between 1 and 200 or p_body is null then return false; end if;
  -- About 2 MB at most (a whole state's mandi reports fit easily).
  if pg_column_size(p_body) > 2000000 then return false; end if;
  insert into public.source_cache (key, body, fetched_at, saved_at)
  values (p_key, p_body, least(coalesce(p_fetched_at, now()), now()), now())
  on conflict (key) do update set body = excluded.body, fetched_at = excluded.fetched_at, saved_at = now();
  delete from public.source_cache where saved_at < now() - interval '30 days';
  delete from public.source_cache where key in (
    select key from public.source_cache order by saved_at desc offset 5000
  );
  return true;
end $$;
revoke all on function public.kr_cache_put(text, text, jsonb, timestamptz) from public;
grant execute on function public.kr_cache_put(text, text, jsonb, timestamptz) to anon, authenticated;

-- {"body": …, "fetched_at": "…"} or null (no copy, or not the server).
create or replace function public.kr_cache_get(p_secret text, p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s text;
  r jsonb;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then return null; end if;
  select jsonb_build_object('body', body, 'fetched_at', fetched_at) into r from public.source_cache where key = p_key;
  return r;
end $$;
revoke all on function public.kr_cache_get(text, text) from public;
grant execute on function public.kr_cache_get(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
