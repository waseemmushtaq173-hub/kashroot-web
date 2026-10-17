-- KashRoot: shared places in the cold store — every farmer books just the
-- boxes they have, 20 or 2,000, and pays for those boxes only.
--   A place (one stack) holds the boxes the owner set. Several farmers can
--   share a place until it is full; each farmer's boxes on it are counted.
--   cold_slot_bookings.boxes   how many of the booking's boxes stand on that place
-- Bookings made before this took the whole place (filled in below).
-- The map shows, for each place, how many boxes are already booked on it
-- (never by whom); booking and confirming check that a place never holds
-- more than it can, inside the same lock as before.
-- Run after 20261021000000_cold_chamber_size.sql. Safe to run again.

alter table public.cold_slot_bookings add column if not exists boxes integer;
alter table public.cold_slot_bookings drop constraint if exists cold_slot_bookings_boxes_check;
alter table public.cold_slot_bookings add constraint cold_slot_bookings_boxes_check check (boxes is null or boxes between 1 and 5000);
update public.cold_slot_bookings s set boxes = c.boxes_per_slot
  from public.cold_chambers c where c.id = s.chamber_id and s.boxes is null;

-- Boxes on a place held by live bookings for months overlapping p_period
-- (p_firm: only paid and confirmed bookings), leaving out one booking.
create or replace function public.kr_cold_used(p_chamber uuid, p_slot text, p_period daterange, p_except uuid default null, p_firm boolean default false)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce(s.boxes, c.boxes_per_slot)), 0)::int
    from public.cold_slot_bookings s
    join public.cold_chambers c on c.id = s.chamber_id
    join public.rental_bookings b on b.id = s.booking_id
   where s.chamber_id = p_chamber and s.slot = p_slot
     and (p_except is null or s.booking_id <> p_except)
     and case when p_firm then b.status in ('confirmed', 'paid') else public.kr_cold_holds(b.status, b.created_at) end
     and public.kr_cold_period(b.start_date, b.duration) && p_period
$$;
revoke execute on function public.kr_cold_used(uuid, text, daterange, uuid, boolean) from public, anon, authenticated;

-- The first place of a booking that would hold more boxes than it can,
-- counting the other live bookings for overlapping months.
create or replace function public.kr_cold_over(p_booking uuid, p_firm boolean default false) returns text
language sql stable security definer set search_path = public as $$
  select c.name || ' · ' || s.slot
    from public.cold_slot_bookings s
    join public.rental_bookings me on me.id = s.booking_id
    join public.cold_chambers c on c.id = s.chamber_id
   where s.booking_id = p_booking
     and coalesce(s.boxes, c.boxes_per_slot)
       + public.kr_cold_used(s.chamber_id, s.slot, public.kr_cold_period(me.start_date, me.duration), p_booking, p_firm) > c.boxes_per_slot
   limit 1
$$;
revoke execute on function public.kr_cold_over(uuid, boolean) from public, anon, authenticated;

-- Kept for kr_booking_action (paying after the 24-hour hold): now "is a place over full".
create or replace function public.kr_cold_clash(p_booking uuid) returns text
language sql stable security definer set search_path = public as $$
  select public.kr_cold_over(p_booking, false)
$$;
revoke execute on function public.kr_cold_clash(uuid) from public, anon, authenticated;

-- Capacity and vacancy of a store with a map: booked boxes, place by place.
create or replace function public.kr_cold_counts(p_listing uuid, out capacity integer, out available integer)
language plpgsql stable security definer set search_path = public as $$
declare used integer;
begin
  select coalesce(sum((c.rows * c.cols - cardinality(c.blocked)) * c.boxes_per_slot), 0)::int into capacity
    from public.cold_chambers c where c.listing_id = p_listing;
  if capacity <= 0 then capacity := null; available := null; return; end if;
  select coalesce(sum(coalesce(s.boxes, c.boxes_per_slot)), 0)::int into used
    from public.cold_slot_bookings s
    join public.cold_chambers c on c.id = s.chamber_id
    join public.rental_bookings b on b.id = s.booking_id
   where c.listing_id = p_listing and b.status in ('confirmed', 'paid')
     and public.kr_cold_period(b.start_date, b.duration) @> current_date;
  available := greatest(0, capacity - used);
end $$;
revoke execute on function public.kr_cold_counts(uuid) from public, anon, authenticated;

-- Chambers: as before, and a place cannot be made smaller than the boxes
-- farmers have booked on it.
create or replace function public.kr_cold_chamber_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare taken text; booked integer;
begin
  -- The same lock as booking, so the owner cannot block a place while a farmer books it.
  perform pg_advisory_xact_lock(hashtext('cold:' || (case when tg_op = 'DELETE' then old.listing_id else new.listing_id end)::text));
  if tg_op in ('INSERT', 'UPDATE') then
    if not exists (select 1 from public.rental_listings l where l.id = new.listing_id and l.kind = 'cold_store') then
      raise exception 'Chambers belong to a cold store';
    end if;
    new.name := trim(new.name);
    -- Only real places of this grid, once each.
    new.blocked := coalesce((
      select array_agg(distinct b order by b) from unnest(new.blocked) b
       where b ~ '^[1-9][0-9]?[A-Z]$' and substring(b from '^[0-9]+')::int <= new.rows and ascii(right(b, 1)) - 64 <= new.cols
    ), '{}');
  end if;
  -- Removing the whole store (its bookings go too) is allowed; only changing
  -- or deleting a chamber under a live booking is not.
  if tg_op = 'DELETE' and not exists (select 1 from public.rental_listings where id = old.listing_id) then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select s.slot into taken
      from public.cold_slot_bookings s join public.rental_bookings b on b.id = s.booking_id
     where s.chamber_id = old.id and public.kr_cold_holds(b.status, b.created_at)
       and (tg_op = 'DELETE' or not public.kr_cold_valid_slot(new, s.slot))
     limit 1;
    if taken is not null then
      raise exception 'Place % in % is booked by a farmer. Finish or cancel that booking first.', taken, old.name;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.boxes_per_slot < old.boxes_per_slot then
    -- The most boxes booked on one place at one time.
    select s.slot, coalesce(s.boxes, old.boxes_per_slot)
             + public.kr_cold_used(old.id, s.slot, public.kr_cold_period(b.start_date, b.duration), s.booking_id)
      into taken, booked
      from public.cold_slot_bookings s join public.rental_bookings b on b.id = s.booking_id
     where s.chamber_id = old.id and public.kr_cold_holds(b.status, b.created_at)
     order by 2 desc
     limit 1;
    if booked > new.boxes_per_slot then
      raise exception 'Place % in % is booked by a farmer with % boxes. Keep at least % boxes on each place, or finish that booking first.', taken, old.name, booked, booked;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ───────────────────────── the map ─────────────────────────
-- For each place with boxes booked for the months asked: its state, the
-- boxes others have booked on it, and the boxes the caller has on it.
--   mine     the caller has boxes here
--   booked   full, all confirmed        held   full, some waiting for payment
--   part     some boxes booked, room left for more
-- Never says who.
drop function if exists public.kr_cold_map(uuid, date, integer);
create function public.kr_cold_map(p_listing uuid, p_start date, p_months integer)
returns table (chamber_id uuid, slot text, state text, used integer, mine integer)
language sql stable security definer set search_path = public as $$
  with live as (
    select s.chamber_id, s.slot, c.boxes_per_slot as cap,
           coalesce(s.boxes, c.boxes_per_slot) as n,
           coalesce(b.renter_id = auth.uid(), false) as is_mine,
           b.status = 'confirmed' as firm
      from public.cold_slot_bookings s
      join public.cold_chambers c on c.id = s.chamber_id
      join public.rental_bookings b on b.id = s.booking_id
      join public.rental_listings l on l.id = c.listing_id
     where c.listing_id = p_listing and (l.active or l.owner_id = auth.uid())
       and public.kr_cold_holds(b.status, b.created_at)
       and public.kr_cold_period(b.start_date, b.duration) && public.kr_cold_period(p_start, p_months)
  )
  select live.chamber_id, live.slot,
         case when bool_or(is_mine) then 'mine'
              when sum(n) >= max(cap) then case when bool_and(firm) then 'booked' else 'held' end
              else 'part' end,
         (coalesce(sum(n) filter (where not is_mine), 0))::int,
         (coalesce(sum(n) filter (where is_mine), 0))::int
    from live
   group by live.chamber_id, live.slot
$$;
grant execute on function public.kr_cold_map(uuid, date, integer) to anon, authenticated;

-- ───────────────────────── booking ─────────────────────────
-- p_places: ['<chamber id>:3B:50', …] — a place and how many of the farmer's
-- boxes go on it (no count: the whole place). Returns the new booking's id.
-- The farmer pays for their own boxes only, then pays the owner by UPI (the
-- boxes are held for 24 hours) and the owner confirms.
create or replace function public.kr_book_cold_places(p_listing uuid, p_places text[], p_start date, p_months integer, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.rental_listings;
  c public.cold_chambers;
  item text;
  chamber uuid;
  place text;
  count_text text;
  n integer;
  room integer;
  boxes integer := 0;
  seen text[] := '{}';
  wanted jsonb := '[]'::jsonb;
  booking uuid;
  clash text;
begin
  if auth.uid() is null then raise exception 'Please sign in to book'; end if;
  if not public.kr_kyc_ok() then raise exception 'Verify your Aadhaar first (My details → Identity check), then book.'; end if;
  select * into l from public.rental_listings where id = p_listing;
  if not found or not l.active or l.kind <> 'cold_store' then raise exception 'This cold store is not taking bookings'; end if;
  if l.owner_id = auth.uid() then raise exception 'You cannot book your own cold store'; end if;
  if p_months is null or p_months not between 1 and 24 then raise exception 'Choose from 1 to 24 months'; end if;
  if p_start is null or p_start < current_date - 1 or p_start > current_date + 400 then raise exception 'Choose a start date from today'; end if;
  if coalesce(cardinality(p_places), 0) = 0 then raise exception 'Choose at least one place on the map'; end if;
  if cardinality(p_places) > 300 then raise exception 'Choose at most 300 places in one booking'; end if;

  -- One booking at a time per store, so a place can never be filled twice over.
  perform pg_advisory_xact_lock(hashtext('cold:' || p_listing::text));

  foreach item in array p_places loop
    chamber := nullif(split_part(item, ':', 1), '')::uuid;
    place := upper(split_part(item, ':', 2));
    count_text := split_part(item, ':', 3);
    select * into c from public.cold_chambers where id = chamber and listing_id = p_listing;
    if not found then raise exception 'That chamber is not part of this cold store'; end if;
    if not public.kr_cold_valid_slot(c, place) then raise exception 'Place % in % cannot be booked', place, c.name; end if;
    if (c.id::text || ':' || place) = any (seen) then raise exception 'Choose place % in % once', place, c.name; end if;
    seen := seen || (c.id::text || ':' || place);
    if count_text !~ '^[0-9]{0,4}$' then raise exception 'Choose how many boxes go on place % in %', place, c.name; end if;
    n := coalesce(nullif(count_text, '')::int, c.boxes_per_slot);
    if n < 1 or n > c.boxes_per_slot then
      raise exception 'Place % in % holds % boxes. Choose from 1 to % boxes for it.', place, c.name, c.boxes_per_slot, c.boxes_per_slot;
    end if;
    room := c.boxes_per_slot - public.kr_cold_used(c.id, place, public.kr_cold_period(p_start, p_months));
    if room <= 0 then
      raise exception 'Place % in % was just taken by someone else. Please choose another.', place, c.name;
    elsif n > room then
      raise exception 'Place % in % was just partly taken by someone else: room is left for % boxes. Please choose again.', place, c.name, room;
    end if;
    boxes := boxes + n;
    wanted := wanted || jsonb_build_object('chamber', c.id, 'slot', place, 'boxes', n);
  end loop;
  if boxes < l.min_units then
    raise exception 'This cold store takes at least % boxes in one booking', l.min_units;
  end if;

  perform set_config('kr.cold_slots', 'on', true);
  insert into public.rental_bookings (listing_id, renter_id, renter_name, renter_phone, units, duration, start_date, status)
  values (p_listing, auth.uid(), left(trim(p_name), 80), left(regexp_replace(p_phone, '\s', '', 'g'), 20), boxes, p_months, p_start, 'requested')
  returning id into booking;
  perform set_config('kr.cold_slots', 'off', true);

  insert into public.cold_slot_bookings (booking_id, chamber_id, slot, boxes)
  select booking, (w ->> 'chamber')::uuid, w ->> 'slot', (w ->> 'boxes')::int from jsonb_array_elements(wanted) w;

  clash := public.kr_cold_over(booking, false);
  if clash is not null then raise exception 'Place % was just taken by someone else. Please choose another.', clash; end if;
  return booking;
end $$;
revoke execute on function public.kr_book_cold_places(uuid, text[], date, integer, text, text) from public, anon;
grant execute on function public.kr_book_cold_places(uuid, text[], date, integer, text, text) to authenticated;

-- The older call books whole places: the same thing without counts (a place
-- named twice counts once, as before).
create or replace function public.kr_book_cold_slots(p_listing uuid, p_slots text[], p_start date, p_months integer, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from unnest(p_slots) x where split_part(x, ':', 3) <> '') then
    raise exception 'Choose how many boxes go on each place';
  end if;
  return public.kr_book_cold_places(
    p_listing,
    (select array_agg(distinct lower(split_part(x, ':', 1)) || ':' || upper(split_part(x, ':', 2))) from unnest(p_slots) x),
    p_start, p_months, p_name, p_phone);
end $$;
revoke execute on function public.kr_book_cold_slots(uuid, text[], date, integer, text, text) from public, anon;
grant execute on function public.kr_book_cold_slots(uuid, text[], date, integer, text, text) to authenticated;

-- renter: pay, cancel · owner: confirm (holds the space), reject, complete (frees it).
-- Bookings by place: paying after the 24-hour hold, and confirming, check that
-- no place would hold more boxes than it can for those months; the store's
-- vacancy is counted from the map instead of by hand.
create or replace function public.kr_booking_action(p_booking uuid, p_action text, p_ref text default null, p_note text default null)
returns public.rental_bookings language plpgsql security definer set search_path = public as $$
declare b public.rental_bookings; l public.rental_listings; by_place boolean; clash text;
begin
  select * into b from public.rental_bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  select * into l from public.rental_listings where id = b.listing_id for update;
  by_place := exists (select 1 from public.cold_slot_bookings where booking_id = b.id);
  if by_place then perform pg_advisory_xact_lock(hashtext('cold:' || l.id::text)); end if;
  if p_action = 'pay' then
    if b.renter_id <> auth.uid() then raise exception 'Not your booking'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking can no longer be paid'; end if;
    if p_ref is null or p_ref !~ '^[A-Za-z0-9]{6,30}$' then raise exception 'Enter the 12-digit UPI reference (UTR) from your payment app'; end if;
    if by_place and b.status = 'requested' and b.created_at <= now() - interval '24 hours' then
      clash := public.kr_cold_clash(b.id);
      if clash is not null then
        raise exception 'Your 24-hour hold ended and % has been booked by someone else. Cancel this booking and choose another place. (If you already paid, ask the owner for the money back.)', clash;
      end if;
    end if;
    update public.rental_bookings set status = 'paid', payment_ref = p_ref where id = p_booking returning * into b;
  elsif p_action = 'cancel' then
    if b.renter_id <> auth.uid() then raise exception 'Not your booking'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'Only bookings not yet confirmed can be cancelled'; end if;
    update public.rental_bookings set status = 'cancelled' where id = p_booking returning * into b;
  elsif p_action = 'confirm' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can confirm'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking is already %', b.status; end if;
    if by_place then
      -- Other farmers' paid or confirmed boxes on the same places and months.
      clash := public.kr_cold_over(b.id, true);
      if clash is not null then raise exception '% is already booked for those months. Decline this booking.', clash; end if;
    else
      if l.available < b.units then raise exception 'Not enough space left: % available', l.available; end if;
      update public.rental_listings set available = available - b.units where id = l.id;
    end if;
    update public.rental_bookings set status = 'confirmed', owner_note = left(p_note, 300) where id = p_booking returning * into b;
  elsif p_action = 'reject' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can reject'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking is already %', b.status; end if;
    update public.rental_bookings set status = 'rejected', owner_note = left(p_note, 300) where id = p_booking returning * into b;
  elsif p_action = 'complete' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can close a booking'; end if;
    if b.status <> 'confirmed' then raise exception 'Only confirmed bookings can be completed'; end if;
    if not by_place then update public.rental_listings set available = least(capacity, available + b.units) where id = l.id; end if;
    update public.rental_bookings set status = 'completed' where id = p_booking returning * into b;
  else
    raise exception 'Unknown action';
  end if;
  if by_place then perform public.kr_cold_recount(l.id); end if;
  return b;
end $$;

-- Every store with a map: count again with the boxes on each place.
do $$ begin
  perform public.kr_cold_recount(l.id) from public.rental_listings l
   where exists (select 1 from public.cold_chambers c where c.listing_id = l.id);
end $$;
