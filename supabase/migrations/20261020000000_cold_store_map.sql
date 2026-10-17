-- KashRoot: the cold store map — farmers choose their own place in the store,
-- the way a seat is chosen when booking a flight.
--   cold_chambers       each chamber of a cold store: rows × columns of places
--                       (bays / pallet spaces), each holding a number of boxes.
--                       Places that cannot be used (pillars, doors, the aisle)
--                       are marked blocked. A place is named row + column
--                       letter: 3B is row 3, column B.
--   cold_slot_bookings  the places a booking holds.
-- A place is taken for a period while a booking holding it is confirmed, paid
-- (waiting for the owner) or requested in the last 24 hours (held while the
-- farmer pays the owner). The map shows which places are taken, never by whom;
-- the owner sees who. Two farmers can never hold the same place for the same
-- months: booking and confirming check it inside one locked transaction.
-- Stores with a map count their free boxes from it (capacity and vacancy are
-- kept up to date automatically).
-- Run after 20261018000000_accounts_last_active.sql. Safe to run again.

-- ───────────────────────── chambers ─────────────────────────
create table if not exists public.cold_chambers (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.rental_listings (id) on delete cascade,
  name           text not null check (char_length(trim(name)) between 1 and 40),
  position       integer not null default 1 check (position between 1 and 100),
  rows           integer not null check (rows between 1 and 60),
  cols           integer not null check (cols between 1 and 26),
  boxes_per_slot integer not null check (boxes_per_slot between 1 and 5000),
  blocked        text[] not null default '{}' check (cardinality(blocked) <= 1560),
  note           text check (char_length(note) <= 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cold_chambers_listing on public.cold_chambers (listing_id, position);
alter table public.cold_chambers enable row level security;
drop trigger if exists cold_chambers_touch on public.cold_chambers;
create trigger cold_chambers_touch before update on public.cold_chambers for each row execute function public.kr_touch();

create table if not exists public.cold_slot_bookings (
  booking_id uuid not null references public.rental_bookings (id) on delete cascade,
  chamber_id uuid not null references public.cold_chambers (id) on delete cascade,
  slot       text not null check (slot ~ '^[1-9][0-9]?[A-Z]$'),
  primary key (booking_id, chamber_id, slot)
);
create index if not exists cold_slot_bookings_place on public.cold_slot_bookings (chamber_id, slot);
alter table public.cold_slot_bookings enable row level security;

-- ───────────────────────── helpers ─────────────────────────
-- The months a booking covers: from its start date, for `months` months.
create or replace function public.kr_cold_period(p_start date, p_months integer) returns daterange
language sql immutable as $$
  select daterange(p_start, (p_start + make_interval(months => greatest(p_months, 1)))::date, '[)')
$$;

-- Does this booking hold its places right now? (Requested bookings are held for 24 hours.)
create or replace function public.kr_cold_holds(p_status text, p_created timestamptz) returns boolean
language sql stable as $$
  select p_status in ('confirmed', 'paid') or (p_status = 'requested' and p_created > now() - interval '24 hours')
$$;

-- Is "3B" a usable place in this chamber?
create or replace function public.kr_cold_valid_slot(c public.cold_chambers, p_slot text) returns boolean
language sql immutable as $$
  select p_slot ~ '^[1-9][0-9]?[A-Z]$'
     and substring(p_slot from '^[0-9]+')::int between 1 and c.rows
     and ascii(right(p_slot, 1)) - 64 between 1 and c.cols
     and not (p_slot = any (c.blocked))
$$;

-- Capacity and vacancy of a store with a map, counted from its places
-- (null when the store has no map: then the owner keeps the box count by hand).
create or replace function public.kr_cold_counts(p_listing uuid, out capacity integer, out available integer)
language plpgsql stable security definer set search_path = public as $$
declare used integer;
begin
  select coalesce(sum((c.rows * c.cols - cardinality(c.blocked)) * c.boxes_per_slot), 0)::int into capacity
    from public.cold_chambers c where c.listing_id = p_listing;
  if capacity <= 0 then capacity := null; available := null; return; end if;
  select coalesce(sum(c.boxes_per_slot), 0)::int into used
    from public.cold_slot_bookings s
    join public.cold_chambers c on c.id = s.chamber_id
    join public.rental_bookings b on b.id = s.booking_id
   where c.listing_id = p_listing and b.status in ('confirmed', 'paid')
     and public.kr_cold_period(b.start_date, b.duration) @> current_date;
  available := greatest(0, capacity - used);
end $$;
revoke execute on function public.kr_cold_counts(uuid) from public, anon, authenticated;

-- Whenever a store with a map is saved, its capacity and vacancy come from the map.
create or replace function public.kr_cold_listing_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap integer; free integer;
begin
  select k.capacity, k.available into cap, free from public.kr_cold_counts(new.id) k;
  if cap is not null then
    new.capacity := cap;
    new.available := free;
  end if;
  return new;
end $$;
drop trigger if exists rental_listings_cold_counts on public.rental_listings;
create trigger rental_listings_cold_counts before update on public.rental_listings for each row execute function public.kr_cold_listing_counts();

create or replace function public.kr_cold_recount(p_listing uuid) returns void
language sql security definer set search_path = public as $$
  -- The trigger above fills in the numbers.
  update public.rental_listings set updated_at = now() where id = p_listing
$$;
revoke execute on function public.kr_cold_recount(uuid) from public, anon, authenticated;

-- Chambers: keep the blocked list tidy, never shrink or block under a booking,
-- and keep the store's capacity in step.
create or replace function public.kr_cold_chamber_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare taken text;
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
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists cold_chambers_before on public.cold_chambers;
create trigger cold_chambers_before before insert or update or delete on public.cold_chambers for each row execute function public.kr_cold_chamber_before();

create or replace function public.kr_cold_chamber_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.kr_cold_recount(coalesce(new.listing_id, old.listing_id));
  return null;
end $$;
drop trigger if exists cold_chambers_after on public.cold_chambers;
create trigger cold_chambers_after after insert or update or delete on public.cold_chambers for each row execute function public.kr_cold_chamber_after();

-- ───────────────────────── who sees what ─────────────────────────
revoke all on public.cold_chambers, public.cold_slot_bookings from anon, authenticated;
grant select on public.cold_chambers to anon, authenticated;
grant insert, update, delete on public.cold_chambers to authenticated;
grant select on public.cold_slot_bookings to authenticated;

drop policy if exists cold_chambers_read on public.cold_chambers;
create policy cold_chambers_read on public.cold_chambers for select to anon, authenticated
  using (exists (select 1 from public.rental_listings l where l.id = listing_id and (l.active or l.owner_id = auth.uid())));
drop policy if exists cold_chambers_owner on public.cold_chambers;
create policy cold_chambers_owner on public.cold_chambers for all to authenticated
  using (exists (select 1 from public.rental_listings l where l.id = listing_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from public.rental_listings l where l.id = listing_id and l.owner_id = auth.uid()));

-- A booking's places: the farmer who booked and the store owner.
drop policy if exists cold_slot_bookings_read on public.cold_slot_bookings;
create policy cold_slot_bookings_read on public.cold_slot_bookings for select to authenticated
  using (exists (select 1 from public.rental_bookings b where b.id = booking_id and (b.renter_id = auth.uid() or b.owner_id = auth.uid())));

-- ───────────────────────── the map ─────────────────────────
-- Taken places of a store for the months asked: 'mine', 'booked' or 'held'
-- (requested or paid, waiting). Never says who.
create or replace function public.kr_cold_map(p_listing uuid, p_start date, p_months integer)
returns table (chamber_id uuid, slot text, state text)
language sql stable security definer set search_path = public as $$
  select s.chamber_id, s.slot,
         case when b.renter_id = auth.uid() then 'mine' when b.status = 'confirmed' then 'booked' else 'held' end
    from public.cold_slot_bookings s
    join public.cold_chambers c on c.id = s.chamber_id
    join public.rental_bookings b on b.id = s.booking_id
    join public.rental_listings l on l.id = c.listing_id
   where c.listing_id = p_listing and (l.active or l.owner_id = auth.uid())
     and public.kr_cold_holds(b.status, b.created_at)
     and public.kr_cold_period(b.start_date, b.duration) && public.kr_cold_period(p_start, p_months)
$$;
grant execute on function public.kr_cold_map(uuid, date, integer) to anon, authenticated;

-- The first place of a booking that another live booking holds for overlapping months, if any.
create or replace function public.kr_cold_clash(p_booking uuid) returns text
language sql stable security definer set search_path = public as $$
  select c.name || ' · ' || s.slot
    from public.cold_slot_bookings s
    join public.rental_bookings me on me.id = s.booking_id
    join public.cold_slot_bookings o on o.chamber_id = s.chamber_id and o.slot = s.slot and o.booking_id <> s.booking_id
    join public.rental_bookings ob on ob.id = o.booking_id
    join public.cold_chambers c on c.id = s.chamber_id
   where s.booking_id = p_booking
     and public.kr_cold_holds(ob.status, ob.created_at)
     and public.kr_cold_period(ob.start_date, ob.duration) && public.kr_cold_period(me.start_date, me.duration)
   limit 1
$$;
revoke execute on function public.kr_cold_clash(uuid) from public, anon, authenticated;

-- ───────────────────────── booking places ─────────────────────────
-- p_slots: ['<chamber id>:3B', …]. Returns the new booking's id. The farmer
-- then pays the owner by UPI (the places are held for 24 hours) and the owner
-- confirms.
create or replace function public.kr_book_cold_slots(p_listing uuid, p_slots text[], p_start date, p_months integer, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.rental_listings;
  c public.cold_chambers;
  item text;
  chamber uuid;
  place text;
  boxes integer := 0;
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
  if coalesce(cardinality(p_slots), 0) = 0 then raise exception 'Choose at least one place on the map'; end if;
  if cardinality(p_slots) > 300 then raise exception 'Choose at most 300 places in one booking'; end if;

  -- One booking at a time per store, so two farmers can never take the same place.
  perform pg_advisory_xact_lock(hashtext('cold:' || p_listing::text));

  foreach item in array (select array_agg(distinct x) from unnest(p_slots) x) loop
    chamber := nullif(split_part(item, ':', 1), '')::uuid;
    place := upper(split_part(item, ':', 2));
    select * into c from public.cold_chambers where id = chamber and listing_id = p_listing;
    if not found then raise exception 'That chamber is not part of this cold store'; end if;
    if not public.kr_cold_valid_slot(c, place) then raise exception 'Place % in % cannot be booked', place, c.name; end if;
    if exists (
      select 1 from public.cold_slot_bookings s join public.rental_bookings b on b.id = s.booking_id
       where s.chamber_id = c.id and s.slot = place and public.kr_cold_holds(b.status, b.created_at)
         and public.kr_cold_period(b.start_date, b.duration) && public.kr_cold_period(p_start, p_months)
    ) then
      raise exception 'Place % in % was just taken by someone else. Please choose another.', place, c.name;
    end if;
    boxes := boxes + c.boxes_per_slot;
    wanted := wanted || jsonb_build_object('chamber', c.id, 'slot', place);
  end loop;

  perform set_config('kr.cold_slots', 'on', true);
  insert into public.rental_bookings (listing_id, renter_id, renter_name, renter_phone, units, duration, start_date, status)
  values (p_listing, auth.uid(), left(trim(p_name), 80), left(regexp_replace(p_phone, '\s', '', 'g'), 20), boxes, p_months, p_start, 'requested')
  returning id into booking;
  perform set_config('kr.cold_slots', 'off', true);

  insert into public.cold_slot_bookings (booking_id, chamber_id, slot)
  select booking, (w ->> 'chamber')::uuid, w ->> 'slot' from jsonb_array_elements(wanted) w;

  clash := public.kr_cold_clash(booking);
  if clash is not null then raise exception 'Place % was just taken by someone else. Please choose another.', clash; end if;
  return booking;
end $$;
revoke execute on function public.kr_book_cold_slots(uuid, text[], date, integer, text, text) from public, anon;
grant execute on function public.kr_book_cold_slots(uuid, text[], date, integer, text, text) to authenticated;

-- Price and owner always come from the listing, never from the browser.
-- Stores with a map are booked by place (kr_book_cold_slots), not by a box count.
create or replace function public.kr_before_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.rental_listings; by_place boolean := coalesce(current_setting('kr.cold_slots', true), '') = 'on';
begin
  select * into l from public.rental_listings where id = new.listing_id;
  if not found or not l.active then raise exception 'This listing is not available'; end if;
  if l.owner_id = new.renter_id then raise exception 'You cannot book your own listing'; end if;
  if not by_place then
    if exists (select 1 from public.cold_chambers c where c.listing_id = l.id) then
      raise exception 'Choose your places on the cold store map to book this store';
    end if;
    if new.units < l.min_units then raise exception 'Minimum booking is % %', l.min_units, case when l.unit = 'box_month' then 'boxes' else 'units' end; end if;
    if new.units > l.available then raise exception 'Only % available right now', l.available; end if;
  end if;
  if new.status not in ('requested', 'paid') then raise exception 'New bookings start as requested or paid'; end if;
  if new.status = 'paid' and new.payment_ref is null then raise exception 'Enter the UPI / bank reference number of your payment'; end if;
  new.owner_id := l.owner_id;
  new.amount := round(l.rate * new.units * new.duration, 2);
  new.owner_note := null;
  return new;
end $$;

-- renter: pay, cancel · owner: confirm (holds the space), reject, complete (frees it).
-- Bookings by place: paying after the 24-hour hold, and confirming, check that
-- nobody else holds the places for those months; the store's vacancy is
-- counted from the map instead of by hand.
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
      -- Another farmer's paid or confirmed booking on the same place and months.
      select c.name || ' · ' || s.slot into clash
        from public.cold_slot_bookings s
        join public.cold_slot_bookings o on o.chamber_id = s.chamber_id and o.slot = s.slot and o.booking_id <> s.booking_id
        join public.rental_bookings ob on ob.id = o.booking_id
        join public.cold_chambers c on c.id = s.chamber_id
       where s.booking_id = b.id and ob.status in ('confirmed', 'paid')
         and public.kr_cold_period(ob.start_date, ob.duration) && public.kr_cold_period(b.start_date, b.duration)
       limit 1;
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
