-- KashRoot TrueScan: keep an official list up to date by itself.
--
-- An admin imports an official list by hand (20261029000000_official_registry.sql).
-- A "feed" is the same list plus the link of the official file it comes from, so
-- the server can read that link every day, and only when the file has changed
-- bring the list up to date:
--   * new products are added, products already there are kept (marked seen);
--   * products that are no longer in the file are removed — unless the new file
--     holds far fewer products than before (a cut-off or changed file), in which
--     case nothing is removed and the failure is shown to the admin;
--   * a file that cannot be read changes nothing.
-- The list's rows stay in official_products with their own name, link and
-- import date; TrueScan reads them exactly as before. Nothing is typed in.
--
-- Only the server (the daily job and the admin's "Check now") writes here, with
-- the service key; the browser never touches this table.
-- Run after 20261124000000_admin_pickup_view.sql. Safe to run again.

create table if not exists public.official_feeds (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('pesticide', 'fertiliser', 'seed', 'other')),
  source           text not null check (char_length(trim(source)) between 2 and 200),
  source_url       text not null check (source_url ~ '^https?://' and char_length(source_url) <= 500),
  -- The official file the server reads (CSV). May hold {DATA_GOV_IN_API_KEY}, which the
  -- server replaces with its own key; the key itself is never stored here.
  file_url         text not null check (file_url ~ '^https://' and char_length(file_url) <= 1000),
  active           boolean not null default true,
  replace_missing  boolean not null default true,
  run_started      timestamptz,
  prev_rows        integer,
  last_checked_at  timestamptz,
  last_changed_at  timestamptz,
  last_hash        text check (last_hash is null or char_length(last_hash) = 64),
  last_status      text not null default 'never' check (last_status in ('never', 'ok', 'unchanged', 'failed')),
  last_error       text check (last_error is null or char_length(last_error) <= 500),
  last_rows        integer,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  unique (kind, source)
);

-- Server only: no policy, no grant — the service key bypasses this; nobody else can read or write.
alter table public.official_feeds enable row level security;
revoke all on public.official_feeds from anon, authenticated;

-- ── Server: start a run. Returns the database's own clock, which marks which rows this run saw. ──
create or replace function public.kr_registry_feed_begin(p_feed uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare f public.official_feeds; started timestamptz := clock_timestamp();
begin
  select * into f from public.official_feeds where id = p_feed for update;
  if not found then raise exception 'No such feed'; end if;
  update public.official_feeds
     set run_started = started,
         prev_rows = (select count(*) from public.official_products where kind = f.kind and source = f.source)
   where id = p_feed;
  return started;
end $$;
revoke all on function public.kr_registry_feed_begin(uuid) from public, anon, authenticated;
grant execute on function public.kr_registry_feed_begin(uuid) to service_role;

-- ── Server: add a batch of the file's rows to the feed's list (at most 2,000 at a time). ──
-- p_rows: [{name, registration_no, registrant, details}], as for kr_registry_import. Returns how many were new.
create or replace function public.kr_registry_feed_import(p_feed uuid, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare f public.official_feeds; added integer;
begin
  select * into f from public.official_feeds where id = p_feed;
  if not found then raise exception 'No such feed'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then return 0; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Import at most 2,000 rows at a time'; end if;
  with rows as (
    select left(regexp_replace(trim(r ->> 'name'), '\s+', ' ', 'g'), 300) as name,
           nullif(left(regexp_replace(trim(coalesce(r ->> 'registration_no', '')), '\s+', ' ', 'g'), 200), '') as registration_no,
           nullif(left(regexp_replace(trim(coalesce(r ->> 'registrant', '')), '\s+', ' ', 'g'), 200), '') as registrant,
           case when jsonb_typeof(r -> 'details') = 'object' and pg_column_size(r -> 'details') <= 4000 then r -> 'details' else '{}'::jsonb end as details
      from jsonb_array_elements(p_rows) r
     where jsonb_typeof(r) = 'object' and char_length(trim(coalesce(r ->> 'name', ''))) between 2 and 300
  ), ins as (
    insert into public.official_products (kind, name, registration_no, registrant, details, source, source_url, imported_at, imported_by)
    select distinct on (coalesce(public.kr_reg_core(registration_no), ''), lower(name), lower(coalesce(registrant, '')))
           f.kind, name, registration_no, registrant, details, trim(f.source), f.source_url, clock_timestamp(), null
      from rows
    on conflict (kind, source, (coalesce(reg_core, '')), (lower(name)), (lower(coalesce(registrant, ''))))
      do update set imported_at = excluded.imported_at, details = excluded.details, source_url = excluded.source_url
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new) into added from ins;
  return added;
end $$;
revoke all on function public.kr_registry_feed_import(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kr_registry_feed_import(uuid, jsonb) to service_role;

-- ── Server: end a run. ──
-- p_status 'ok' (the file was read and imported) or 'failed' (p_error says why; nothing is removed).
-- On 'ok' with replace_missing, products this run did not see are removed — unless fewer than
-- half of the products that were there were seen again, which is treated as a failed run.
-- Returns {status, removed, seen}.
create or replace function public.kr_registry_feed_finish(p_feed uuid, p_status text, p_hash text, p_rows integer, p_error text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare f public.official_feeds; seen integer := 0; removed integer := 0; status text := p_status; err text := left(p_error, 500);
begin
  select * into f from public.official_feeds where id = p_feed for update;
  if not found then raise exception 'No such feed'; end if;
  if p_status not in ('ok', 'failed') then raise exception 'Unknown status'; end if;
  if p_status = 'ok' then
    select count(*) into seen from public.official_products
     where kind = f.kind and source = f.source and imported_at >= coalesce(f.run_started, '-infinity');
    if f.replace_missing then
      if coalesce(f.prev_rows, 0) > 0 and seen * 2 < f.prev_rows then
        status := 'failed';
        err := left('The new file has far fewer products (' || seen || ') than the list had (' || f.prev_rows || '); nothing was removed.', 500);
      else
        delete from public.official_products
         where kind = f.kind and source = f.source and imported_at < coalesce(f.run_started, '-infinity');
        get diagnostics removed = row_count;
      end if;
    end if;
  end if;
  update public.official_feeds
     set last_checked_at = now(),
         last_status = status,
         last_error = case when status = 'failed' then err else null end,
         last_rows = case when status = 'ok' then p_rows else last_rows end,
         last_hash = case when status = 'ok' then p_hash else last_hash end,
         last_changed_at = case when status = 'ok' then now() else last_changed_at end,
         run_started = null
   where id = p_feed;
  return jsonb_build_object('status', status, 'removed', removed, 'seen', seen, 'error', case when status = 'failed' then err else null end);
end $$;
revoke all on function public.kr_registry_feed_finish(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.kr_registry_feed_finish(uuid, text, text, integer, text) to service_role;

-- ── Server: the file has not changed since the last run — only note that it was checked. ──
create or replace function public.kr_registry_feed_unchanged(p_feed uuid)
returns void
language sql security definer set search_path = public as $$
  update public.official_feeds set last_checked_at = now(), last_status = 'unchanged', last_error = null where id = p_feed;
$$;
revoke all on function public.kr_registry_feed_unchanged(uuid) from public, anon, authenticated;
grant execute on function public.kr_registry_feed_unchanged(uuid) to service_role;

-- ── Everyone: what the lists hold, now also saying which list is kept up to date and when it was last checked. ──
-- Same answer as before ({total, last_import, kinds, lists}); each list gains "auto" and "checked_at".
create or replace function public.kr_registry_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  with l as (
    select kind, source, max(source_url) as url, count(*) as n, max(imported_at) as last
      from public.official_products group by kind, source
  )
  select jsonb_build_object(
    'total', coalesce((select sum(n) from l), 0),
    'last_import', (select max(last) from l),
    'kinds', coalesce((
      select jsonb_object_agg(kind, jsonb_build_object('count', n, 'last_import', last))
        from (select kind, sum(n) as n, max(last) as last from l group by kind) k
    ), '{}'::jsonb),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', l.kind, 'source', l.source, 'source_url', l.url, 'count', l.n, 'imported_at', l.last,
               'auto', (f.id is not null and f.active),
               'checked_at', case when f.id is not null and f.active then f.last_checked_at end,
               'auto_status', case when f.id is not null and f.active then f.last_status end
             ) order by l.last desc)
        from l left join public.official_feeds f on f.kind = l.kind and f.source = l.source
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.kr_registry_stats() from public;
grant execute on function public.kr_registry_stats() to anon, authenticated;

notify pgrst, 'reload schema';
