-- KashRoot: cold stores described in full by their owners (the owner wizard,
-- components/rental/owner and lib/coldStore).
--   rental_listings  + manager_name, manager_phone (10 digits), state (default
--                      Jammu & Kashmir), area (area / village), building:
--                      {unit: 'ft' | 'm', length, width, height,
--                       door: {wall: 'front' | 'back' | 'left' | 'right',
--                              from, width, height}}
--                      in metres; length runs along the front, width from the
--                      front to the back; the door's `from` is from the left
--                      corner of its wall as you stand outside facing it.
--   cold_chambers    + chamber_no, floor (1 = lowest), storage ('bins',
--                      'crates', or 'boxes' for stores set up before),
--                      unit_kg (kg in one bin / crate), capacity_mt (what the
--                      owner says the whole chamber holds), rate (rupees per
--                      bin / crate per month; null = the store's rate).
--                      Each floor of a chamber is its own row ("Chamber 1 ·
--                      Floor 2"), so booking, holds and the map work as
--                      before: one place = one stack, boxes_per_slot = bins /
--                      crates in it. A floor may now have up to 99 rows.
--   kr_save_cold_chambers(listing, rows)  the owner saves all the wizard's
--                      chambers of a store at once: new floors added, changed
--                      ones changed in place, removed ones deleted — refused
--                      (nothing saved) when a farmer has booked a place that
--                      would go or shrink. Older chambers are left alone.
--   A booking by place costs each chamber's own rate (else the store's):
--   boxes × rate × months, worked out here, never in the browser.
-- Run after 20261024000000_cold_store_suggestions.sql. Safe to run again.

-- ───────────────────────── the store ─────────────────────────
alter table public.rental_listings add column if not exists manager_name text;
alter table public.rental_listings add column if not exists manager_phone text;
alter table public.rental_listings add column if not exists state text not null default 'Jammu & Kashmir';
alter table public.rental_listings add column if not exists area text;
alter table public.rental_listings add column if not exists building jsonb;

alter table public.rental_listings drop constraint if exists rental_listings_manager_name_check;
alter table public.rental_listings add constraint rental_listings_manager_name_check check (manager_name is null or char_length(manager_name) <= 80);
alter table public.rental_listings drop constraint if exists rental_listings_manager_phone_check;
alter table public.rental_listings add constraint rental_listings_manager_phone_check check (manager_phone is null or manager_phone ~ '^[6-9][0-9]{9}$');
alter table public.rental_listings drop constraint if exists rental_listings_state_check;
alter table public.rental_listings add constraint rental_listings_state_check check (char_length(state) between 2 and 60);
alter table public.rental_listings drop constraint if exists rental_listings_area_check;
alter table public.rental_listings add constraint rental_listings_area_check check (area is null or char_length(area) <= 80);
alter table public.rental_listings drop constraint if exists rental_listings_building_check;
alter table public.rental_listings add constraint rental_listings_building_check
  check (building is null or (jsonb_typeof(building) = 'object' and pg_column_size(building) < 2000));

-- ───────────────────────── chambers and their floors ─────────────────────────
alter table public.cold_chambers add column if not exists chamber_no integer;
alter table public.cold_chambers add column if not exists floor integer not null default 1;
alter table public.cold_chambers add column if not exists storage text not null default 'boxes';
alter table public.cold_chambers add column if not exists unit_kg numeric(10, 2);
alter table public.cold_chambers add column if not exists capacity_mt numeric(12, 3);
alter table public.cold_chambers add column if not exists rate numeric(12, 2);

alter table public.cold_chambers drop constraint if exists cold_chambers_chamber_no_check;
alter table public.cold_chambers add constraint cold_chambers_chamber_no_check check (chamber_no is null or chamber_no between 1 and 999);
alter table public.cold_chambers drop constraint if exists cold_chambers_floor_check;
alter table public.cold_chambers add constraint cold_chambers_floor_check check (floor between 1 and 10);
alter table public.cold_chambers drop constraint if exists cold_chambers_storage_check;
alter table public.cold_chambers add constraint cold_chambers_storage_check check (storage in ('bins', 'crates', 'boxes'));
alter table public.cold_chambers drop constraint if exists cold_chambers_unit_kg_check;
alter table public.cold_chambers add constraint cold_chambers_unit_kg_check check (unit_kg is null or (unit_kg > 0 and unit_kg <= 5000));
alter table public.cold_chambers drop constraint if exists cold_chambers_capacity_mt_check;
alter table public.cold_chambers add constraint cold_chambers_capacity_mt_check check (capacity_mt is null or (capacity_mt > 0 and capacity_mt <= 1000000));
alter table public.cold_chambers drop constraint if exists cold_chambers_rate_check;
alter table public.cold_chambers add constraint cold_chambers_rate_check check (rate is null or (rate >= 0 and rate <= 100000));
-- A floor of a big chamber may need more rows than the old map's 60 (place codes allow 1–99).
alter table public.cold_chambers drop constraint if exists cold_chambers_rows_check;
alter table public.cold_chambers add constraint cold_chambers_rows_check check (rows between 1 and 99);
alter table public.cold_chambers drop constraint if exists cold_chambers_blocked_check;
alter table public.cold_chambers add constraint cold_chambers_blocked_check check (cardinality(blocked) <= 2574);
-- One row per floor of each numbered chamber.
create unique index if not exists cold_chambers_floor on public.cold_chambers (listing_id, chamber_no, floor) where chamber_no is not null;

-- ───────────────────────── saving a store's chambers ─────────────────────────
-- p_rows: [{chamber_no, floor, name, position, rows, cols, boxes_per_slot,
-- blocked, storage, unit_kg, capacity_mt, rate, size}, …] — every floor of
-- every wizard chamber the store should have (lib/coldStore storeModel).
create or replace function public.kr_save_cold_chambers(p_listing uuid, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  l public.rental_listings;
  r jsonb;
  keep text[] := '{}';
  found_id uuid;
  n integer := 0;
  lowest numeric;
begin
  if auth.uid() is null then raise exception 'Please sign in again to save your cold store'; end if;
  select * into l from public.rental_listings where id = p_listing;
  if not found or l.owner_id is distinct from auth.uid() then raise exception 'This is not your cold store'; end if;
  if l.kind <> 'cold_store' then raise exception 'Chambers belong to a cold store'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Nothing to save'; end if;
  if jsonb_array_length(p_rows) > 100 then
    raise exception 'A cold store on KashRoot can have at most 100 chamber floors (chambers × floors). Use fewer chambers or floors.';
  end if;

  -- The same lock as booking, so nobody books a place while it changes.
  perform pg_advisory_xact_lock(hashtext('cold:' || p_listing::text));

  for r in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) <> 'object' or coalesce(r ->> 'chamber_no', '') !~ '^[0-9]{1,3}$' or coalesce(r ->> 'floor', '') !~ '^[0-9]{1,2}$' then
      raise exception 'Each chamber needs a number (1 to 999) and a floor (1 to 10)';
    end if;
    if coalesce(r ->> 'storage', '') not in ('bins', 'crates') then raise exception 'Each chamber holds bins or crates'; end if;
    keep := keep || ((r ->> 'chamber_no')::int || ':' || (r ->> 'floor')::int);
  end loop;
  if cardinality(keep) <> (select count(distinct k) from unnest(keep) k) then
    raise exception 'Two chambers have the same number. Give each chamber its own number.';
  end if;

  -- Floors no longer there go first (the chamber trigger refuses a booked one).
  delete from public.cold_chambers c
   where c.listing_id = p_listing and c.chamber_no is not null
     and not ((c.chamber_no || ':' || c.floor) = any (keep));

  -- Then every floor: changed in place, or added.
  for r in select * from jsonb_array_elements(p_rows) loop
    update public.cold_chambers c set
      name = r ->> 'name',
      position = (r ->> 'position')::int,
      rows = (r ->> 'rows')::int,
      cols = (r ->> 'cols')::int,
      boxes_per_slot = (r ->> 'boxes_per_slot')::int,
      blocked = coalesce((select array_agg(b) from jsonb_array_elements_text(coalesce(r -> 'blocked', '[]'::jsonb)) b), '{}'),
      storage = r ->> 'storage',
      unit_kg = (r ->> 'unit_kg')::numeric,
      capacity_mt = (r ->> 'capacity_mt')::numeric,
      rate = (r ->> 'rate')::numeric,
      size = r -> 'size'
     where c.listing_id = p_listing and c.chamber_no = (r ->> 'chamber_no')::int and c.floor = (r ->> 'floor')::int
     returning c.id into found_id;
    if found_id is null then
      insert into public.cold_chambers (listing_id, chamber_no, floor, name, position, rows, cols, boxes_per_slot, blocked, storage, unit_kg, capacity_mt, rate, size)
      values (
        p_listing, (r ->> 'chamber_no')::int, (r ->> 'floor')::int, r ->> 'name', (r ->> 'position')::int, (r ->> 'rows')::int, (r ->> 'cols')::int,
        (r ->> 'boxes_per_slot')::int,
        coalesce((select array_agg(b) from jsonb_array_elements_text(coalesce(r -> 'blocked', '[]'::jsonb)) b), '{}'),
        r ->> 'storage', (r ->> 'unit_kg')::numeric, (r ->> 'capacity_mt')::numeric, (r ->> 'rate')::numeric, r -> 'size'
      );
    end if;
    n := n + 1;
  end loop;

  -- The store's own rate (shown as "from ₹…"): the lowest chamber rate, unless
  -- older chambers (which use the store's rate) are still there.
  if not exists (select 1 from public.cold_chambers where listing_id = p_listing and chamber_no is null) then
    select min(rate) into lowest from public.cold_chambers where listing_id = p_listing and rate is not null;
    if lowest is not null then update public.rental_listings set rate = lowest where id = p_listing; end if;
  end if;
  return n;
end $$;
revoke execute on function public.kr_save_cold_chambers(uuid, jsonb) from public, anon;
grant execute on function public.kr_save_cold_chambers(uuid, jsonb) to authenticated;

-- ───────────────────────── what a booking costs ─────────────────────────
-- Once a booking's places are in: its boxes on each place × that chamber's
-- rate (else the store's) × months. Same as before for stores without
-- chamber rates.
create or replace function public.kr_cold_booking_amount() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.rental_bookings b
     set amount = round(b.duration * coalesce((
           select sum(coalesce(s.boxes, c.boxes_per_slot) * coalesce(c.rate, l.rate))
             from public.cold_slot_bookings s
             join public.cold_chambers c on c.id = s.chamber_id
             join public.rental_listings l on l.id = c.listing_id
            where s.booking_id = b.id), 0), 2)
   where b.id in (select distinct a.booking_id from added a);
  return null;
end $$;
revoke execute on function public.kr_cold_booking_amount() from public, anon, authenticated;
drop trigger if exists cold_slot_bookings_amount on public.cold_slot_bookings;
create trigger cold_slot_bookings_amount after insert on public.cold_slot_bookings
  referencing new table as added for each statement execute function public.kr_cold_booking_amount();
