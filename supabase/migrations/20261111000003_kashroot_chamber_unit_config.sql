-- supabase/migrations/20261111000003_kashroot_chamber_unit_config.sql

-- 6. The owner wizard's chamber save (kr_save_cold_chambers) also writes the
-- 3D twin's unit config (the 20261111000002 columns): the unit kind from the
-- chamber's own bins / crates choice, the rack levels the owner now types,
-- and the unit size and stack gap from the very measured size the row
-- already carries. A value a row does not carry keeps what it had (or the
-- column's default when the row is new).
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
    if (r ? 'levels_count') and (coalesce(r ->> 'levels_count', '') !~ '^[0-9]{1,2}$' or (r ->> 'levels_count')::int not between 1 and 10) then
      raise exception 'Rack levels must be a number from 1 to 10';
    end if;
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
      size = r -> 'size',
      storage_unit_type = case when r ->> 'storage' = 'crates' then 'PLASTIC_CRATE' else 'WOODEN_BIN' end,
      unit_default_capacity_kg = coalesce(nullif(r ->> 'unit_kg', '')::numeric, c.unit_default_capacity_kg),
      unit_length_m = coalesce(nullif(r #>> '{size,box,l}', '')::numeric, c.unit_length_m),
      unit_width_m = coalesce(nullif(r #>> '{size,box,w}', '')::numeric, c.unit_width_m),
      unit_height_m = coalesce(nullif(r #>> '{size,box,h}', '')::numeric, c.unit_height_m),
      unit_spacing_m = coalesce(nullif(r #>> '{size,stackGap}', '')::numeric, c.unit_spacing_m),
      levels_count = greatest(1, least(10, coalesce(nullif(r ->> 'levels_count', '')::int, c.levels_count, 4)))
     where c.listing_id = p_listing and c.chamber_no = (r ->> 'chamber_no')::int and c.floor = (r ->> 'floor')::int
     returning c.id into found_id;
    if found_id is null then
      insert into public.cold_chambers (listing_id, chamber_no, floor, name, position, rows, cols, boxes_per_slot, blocked, storage, unit_kg, capacity_mt, rate, size, storage_unit_type, unit_default_capacity_kg, unit_length_m, unit_width_m, unit_height_m, unit_spacing_m, levels_count)
      values (
        p_listing, (r ->> 'chamber_no')::int, (r ->> 'floor')::int, r ->> 'name', (r ->> 'position')::int, (r ->> 'rows')::int, (r ->> 'cols')::int,
        (r ->> 'boxes_per_slot')::int,
        coalesce((select array_agg(b) from jsonb_array_elements_text(coalesce(r -> 'blocked', '[]'::jsonb)) b), '{}'),
        r ->> 'storage', (r ->> 'unit_kg')::numeric, (r ->> 'capacity_mt')::numeric, (r ->> 'rate')::numeric, r -> 'size',
        case when r ->> 'storage' = 'crates' then 'PLASTIC_CRATE' else 'WOODEN_BIN' end,
        coalesce(nullif(r ->> 'unit_kg', '')::numeric, case when r ->> 'storage' = 'crates' then 16.5 else 200.0 end),
        coalesce(nullif(r #>> '{size,box,l}', '')::numeric, case when r ->> 'storage' = 'crates' then 0.540 else 1.200 end),
        coalesce(nullif(r #>> '{size,box,w}', '')::numeric, case when r ->> 'storage' = 'crates' then 0.360 else 1.000 end),
        coalesce(nullif(r #>> '{size,box,h}', '')::numeric, case when r ->> 'storage' = 'crates' then 0.290 else 0.780 end),
        coalesce(nullif(r #>> '{size,stackGap}', '')::numeric, case when r ->> 'storage' = 'crates' then 0.080 else 0.120 end),
        greatest(1, least(10, coalesce(nullif(r ->> 'levels_count', '')::int, 4)))
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
