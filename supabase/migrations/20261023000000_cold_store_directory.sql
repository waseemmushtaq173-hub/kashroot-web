-- KashRoot: the directory of ALL cold stores — not only those on KashRoot.
--   cold_store_directory  real cold stores and CA stores in Jammu & Kashmir,
--                         each saying where it comes from (e.g. the National
--                         Horticulture Board's cold storage database, a MoFPI
--                         list, the owner). Everyone can read it; only an
--                         admin adds, imports or removes entries.
-- The KashRoot server also reads the official NHB list and OpenStreetMap
-- live (api/cold-stores); this table keeps what the admin has imported or
-- checked, so the directory never depends on one website being up.
-- Stores listed on KashRoot (rental_listings) are shown with it, bookable.
-- Run after 20261022000000_cold_shared_places.sql. Safe to run again.

create table if not exists public.cold_store_directory (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 2 and 120),
  district    text check (char_length(district) <= 60),
  place       text check (char_length(place) <= 160),
  state       text not null default 'Jammu & Kashmir' check (char_length(state) between 2 and 60),
  capacity_mt integer check (capacity_mt is null or capacity_mt between 1 and 1000000),
  kind        text check (kind is null or kind in ('ca', 'cold', 'multi')),
  phone       text check (phone is null or char_length(phone) between 6 and 20),
  lat         double precision check (lat is null or lat between -90 and 90),
  lon         double precision check (lon is null or lon between -180 and 180),
  source      text not null check (char_length(trim(source)) between 2 and 200),
  source_url  text check (source_url is null or (source_url ~ '^https?://' and char_length(source_url) <= 500)),
  added_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- One entry per store: the same name in the same district is the same store.
create unique index if not exists cold_store_directory_store on public.cold_store_directory (lower(trim(name)), lower(coalesce(trim(district), '')));
create index if not exists cold_store_directory_district on public.cold_store_directory (district);
alter table public.cold_store_directory enable row level security;
drop trigger if exists cold_store_directory_touch on public.cold_store_directory;
create trigger cold_store_directory_touch before update on public.cold_store_directory for each row execute function public.kr_touch();

revoke all on public.cold_store_directory from anon, authenticated;
grant select on public.cold_store_directory to anon, authenticated;
grant insert, update, delete on public.cold_store_directory to authenticated;

drop policy if exists cold_store_directory_read on public.cold_store_directory;
create policy cold_store_directory_read on public.cold_store_directory for select to anon, authenticated using (true);
drop policy if exists cold_store_directory_admin on public.cold_store_directory;
create policy cold_store_directory_admin on public.cold_store_directory for all to authenticated
  using (public.kr_has_role('ADMIN')) with check (public.kr_has_role('ADMIN'));

-- Admin: import many entries at once (e.g. the NHB file). Stores already in
-- the directory (same name and district) are left as they are. Returns how
-- many were added.
create or replace function public.kr_directory_import(p_rows jsonb, p_source text, p_source_url text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare added integer;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can import cold stores'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Import at most 5,000 cold stores at a time'; end if;
  if char_length(trim(coalesce(p_source, ''))) < 2 then raise exception 'Say where the list comes from'; end if;
  with rows as (
    select left(trim(r ->> 'name'), 120) as name,
           nullif(left(trim(r ->> 'district'), 60), '') as district,
           nullif(left(trim(r ->> 'place'), 160), '') as place,
           coalesce(nullif(left(trim(r ->> 'state'), 60), ''), 'Jammu & Kashmir') as state,
           case when (r ->> 'capacity_mt') ~ '^[0-9]{1,7}$' and (r ->> 'capacity_mt')::int between 1 and 1000000 then (r ->> 'capacity_mt')::int end as capacity_mt,
           case when r ->> 'kind' in ('ca', 'cold', 'multi') then r ->> 'kind' end as kind,
           case when char_length(regexp_replace(coalesce(r ->> 'phone', ''), '\s', '', 'g')) between 6 and 20 then regexp_replace(r ->> 'phone', '\s', '', 'g') end as phone,
           case when (r ->> 'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' and (r ->> 'lat')::float8 between -90 and 90 then (r ->> 'lat')::float8 end as lat,
           case when (r ->> 'lon') ~ '^-?[0-9]+(\.[0-9]+)?$' and (r ->> 'lon')::float8 between -180 and 180 then (r ->> 'lon')::float8 end as lon
      from jsonb_array_elements(p_rows) r
     where char_length(trim(coalesce(r ->> 'name', ''))) between 2 and 120
  ), ins as (
    insert into public.cold_store_directory (name, district, place, state, capacity_mt, kind, phone, lat, lon, source, source_url)
    select distinct on (lower(name), lower(coalesce(district, ''))) name, district, place, state, capacity_mt, kind, phone, lat, lon,
           left(trim(p_source), 200), case when p_source_url ~ '^https?://' then left(p_source_url, 500) end
      from rows
    on conflict do nothing
    returning 1
  )
  select count(*) into added from ins;
  return added;
end $$;
revoke execute on function public.kr_directory_import(jsonb, text, text) from public, anon;
grant execute on function public.kr_directory_import(jsonb, text, text) to authenticated;
