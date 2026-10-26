-- KashRoot: booking bins and crates in a cold store, paying the owner
-- directly, and the receipt the farmer shows at the store
-- (components/rental/ColdBooking, components/rental/receipt,
-- app/(dashboards)/rental/receipt/[id]).
--   rental_bookings     + paid_at (when the farmer said they paid and gave the
--                         payment reference), confirmed_at (when the owner
--                         pressed "Money received"), paid_to (whom the farmer
--                         was asked to pay at that moment: name, UPI ID, last 4
--                         digits of the account, IFSC, bank). Written only by
--                         the database.
--   cold_slot_bookings  + rate: the rupees a month for one bin / crate / box on
--                         that place when it was booked (the chamber's own
--                         rate, else the store's), so a receipt keeps the
--                         price even if the owner changes the rent later.
--   kr_book_cold_places   as before (24-hour hold, one booking at a time, a
--                         place never over full), but it speaks of bins,
--                         crates or boxes as each chamber holds them, names a
--                         place in words ("Chamber 1 · Floor 2 · Row 3, stack
--                         2"), and keeps each place's rate. The price is
--                         worked out here: bins on each place × that rate ×
--                         months (kr_cold_booking_amount).
--   kr_cold_free_now(stores)  per chamber floor: bins / crates free today.
--   kr_cold_receipt(booking)  everything the receipt shows — only to the farmer
--                         who booked and to the store's owner.
-- KashRoot never holds money: these only record what the farmer says they
-- paid directly to the owner, and what the owner confirmed.
-- Run after 20261025000000_cold_store_details.sql. Safe to run again.

-- ───────────────────────── words ─────────────────────────
-- "bin" / "bins", "crate" / "crates", "box" / "boxes".
create or replace function public.kr_cold_word(p_storage text, p_n integer) returns text
language sql immutable as $$
  select case coalesce(p_storage, 'boxes')
           when 'bins' then case when p_n = 1 then 'bin' else 'bins' end
           when 'crates' then case when p_n = 1 then 'crate' else 'crates' end
           else case when p_n = 1 then 'box' else 'boxes' end
         end
$$;

-- "Chamber 1 · Floor 2" + "3B" → "Chamber 1 · Floor 2 · Row 3, stack 2".
create or replace function public.kr_cold_place_name(p_chamber text, p_slot text) returns text
language sql immutable as $$
  select p_chamber || ' · Row ' || coalesce(substring(p_slot from '^[0-9]+'), '?') || ', stack ' || (ascii(right(p_slot, 1)) - 64)
$$;

-- ───────────────────────── what a booking records ─────────────────────────
alter table public.rental_bookings add column if not exists paid_at timestamptz;
alter table public.rental_bookings add column if not exists confirmed_at timestamptz;
alter table public.rental_bookings add column if not exists paid_to jsonb;
alter table public.cold_slot_bookings add column if not exists rate numeric(12, 2);
alter table public.cold_slot_bookings drop constraint if exists cold_slot_bookings_rate_check;
alter table public.cold_slot_bookings add constraint cold_slot_bookings_rate_check check (rate is null or rate >= 0);

-- Only the database writes when a booking was paid and confirmed, and whom
-- the farmer paid (the owner's payment details at that moment).
create or replace function public.kr_booking_stamps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.paid_at := null;
    new.confirmed_at := null;
    new.paid_to := null;
  else
    new.paid_at := old.paid_at;
    new.confirmed_at := old.confirmed_at;
    new.paid_to := old.paid_to;
  end if;
  if new.status = 'paid' and new.payment_ref is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'paid' or old.payment_ref is distinct from new.payment_ref) then
    new.paid_at := now();
    new.paid_to := (
      select jsonb_build_object('name', a.account_name, 'upi', a.upi_id, 'account_end', right(a.account_number, 4), 'ifsc', a.ifsc, 'bank', a.bank_name)
        from public.payout_accounts a where a.user_id = new.owner_id
    );
  end if;
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    new.confirmed_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.kr_booking_stamps() from public, anon, authenticated;
-- Runs after rental_bookings_before (which sets the owner) — triggers go in name order.
drop trigger if exists rental_bookings_stamps on public.rental_bookings;
create trigger rental_bookings_stamps before insert or update on public.rental_bookings
  for each row execute function public.kr_booking_stamps();

-- ───────────────────────── places in words ─────────────────────────
-- The first place of a booking that would hold more than it can (as before),
-- named in words for the farmer.
create or replace function public.kr_cold_over(p_booking uuid, p_firm boolean default false) returns text
language sql stable security definer set search_path = public as $$
  select public.kr_cold_place_name(c.name, s.slot)
    from public.cold_slot_bookings s
    join public.rental_bookings me on me.id = s.booking_id
    join public.cold_chambers c on c.id = s.chamber_id
   where s.booking_id = p_booking
     and coalesce(s.boxes, c.boxes_per_slot)
       + public.kr_cold_used(s.chamber_id, s.slot, public.kr_cold_period(me.start_date, me.duration), p_booking, p_firm) > c.boxes_per_slot
   limit 1
$$;
revoke execute on function public.kr_cold_over(uuid, boolean) from public, anon, authenticated;

-- ───────────────────────── booking ─────────────────────────
-- p_places: ['<chamber id>:3B:50', …] — a place and how many of the farmer's
-- bins / crates / boxes go on it (no count: the whole place). Returns the new
-- booking's id. The places are held for 24 hours while the farmer pays the
-- owner directly; the owner confirms when the money arrives.
create or replace function public.kr_book_cold_places(p_listing uuid, p_places text[], p_start date, p_months integer, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.rental_listings;
  c public.cold_chambers;
  item text;
  chamber_text text;
  place text;
  here text;
  count_text text;
  n integer;
  room integer;
  boxes integer := 0;
  seen text[] := '{}';
  kinds text[] := '{}';
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
    chamber_text := split_part(item, ':', 1);
    place := upper(split_part(item, ':', 2));
    count_text := split_part(item, ':', 3);
    if chamber_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'That chamber is not part of this cold store. Close the window, open the store again and choose again.';
    end if;
    select * into c from public.cold_chambers where id = chamber_text::uuid and listing_id = p_listing;
    if not found then raise exception 'That chamber is not part of this cold store. Close the window, open the store again and choose again.'; end if;
    here := public.kr_cold_place_name(c.name, place);
    if not public.kr_cold_valid_slot(c, place) then raise exception '% cannot be booked. Please choose another place.', here; end if;
    if (c.id::text || ':' || place) = any (seen) then raise exception '% is chosen twice. Choose each place once.', here; end if;
    seen := seen || (c.id::text || ':' || place);
    if count_text !~ '^[0-9]{0,4}$' then raise exception 'Choose how many % go on %', public.kr_cold_word(c.storage, 2), here; end if;
    n := coalesce(nullif(count_text, '')::int, c.boxes_per_slot);
    if n < 1 or n > c.boxes_per_slot then
      raise exception '% holds % %. Choose from 1 to % for it.', here, c.boxes_per_slot, public.kr_cold_word(c.storage, c.boxes_per_slot), c.boxes_per_slot;
    end if;
    room := c.boxes_per_slot - public.kr_cold_used(c.id, place, public.kr_cold_period(p_start, p_months));
    if room <= 0 then
      raise exception '% was just taken by someone else. Please choose another place.', here;
    elsif n > room then
      raise exception '% was just partly taken by someone else: room is left for % %. Please choose again.', here, room, public.kr_cold_word(c.storage, room);
    end if;
    boxes := boxes + n;
    if not (c.storage = any (kinds)) then kinds := kinds || c.storage; end if;
    wanted := wanted || jsonb_build_object('chamber', c.id, 'slot', place, 'boxes', n, 'rate', coalesce(c.rate, l.rate));
  end loop;
  if boxes < l.min_units then
    raise exception 'This cold store takes at least % % in one booking', l.min_units,
      case when cardinality(kinds) = 1 then public.kr_cold_word(kinds[1], l.min_units) else 'bins or crates' end;
  end if;

  perform set_config('kr.cold_slots', 'on', true);
  insert into public.rental_bookings (listing_id, renter_id, renter_name, renter_phone, units, duration, start_date, status)
  values (p_listing, auth.uid(), left(trim(p_name), 80), left(regexp_replace(p_phone, '\s', '', 'g'), 20), boxes, p_months, p_start, 'requested')
  returning id into booking;
  perform set_config('kr.cold_slots', 'off', true);

  -- The price is set by cold_slot_bookings_amount once the places are in.
  insert into public.cold_slot_bookings (booking_id, chamber_id, slot, boxes, rate)
  select booking, (w ->> 'chamber')::uuid, w ->> 'slot', (w ->> 'boxes')::int, (w ->> 'rate')::numeric from jsonb_array_elements(wanted) w;

  clash := public.kr_cold_over(booking, false);
  if clash is not null then raise exception '% was just taken by someone else. Please choose another place.', clash; end if;
  return booking;
end $$;
revoke execute on function public.kr_book_cold_places(uuid, text[], date, integer, text, text) from public, anon;
grant execute on function public.kr_book_cold_places(uuid, text[], date, integer, text, text) to authenticated;

-- What a booking costs, once its places are in: the bins on each place × the
-- rate kept on that place (the chamber's own, else the store's) × months.
create or replace function public.kr_cold_booking_amount() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.rental_bookings b
     set amount = round(b.duration * coalesce((
           select sum(coalesce(s.boxes, c.boxes_per_slot) * coalesce(s.rate, c.rate, l.rate))
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

-- ───────────────────────── free now ─────────────────────────
-- For the store cards: bins / crates / boxes still free today on each chamber
-- floor (places held for payment count as taken). Never says who.
create or replace function public.kr_cold_free_now(p_listings uuid[])
returns table (chamber_id uuid, free integer)
language sql stable security definer set search_path = public as $$
  select c.id,
         greatest(0, (c.rows * c.cols - cardinality(c.blocked)) * c.boxes_per_slot - coalesce((
           select sum(coalesce(s.boxes, c.boxes_per_slot))
             from public.cold_slot_bookings s
             join public.rental_bookings b on b.id = s.booking_id
            where s.chamber_id = c.id
              and public.kr_cold_holds(b.status, b.created_at)
              and public.kr_cold_period(b.start_date, b.duration) @> current_date), 0))::int
    from public.cold_chambers c
    join public.rental_listings l on l.id = c.listing_id
   where c.listing_id = any ((coalesce(p_listings, '{}'::uuid[]))[1:200])
     and (l.active or l.owner_id = auth.uid())
$$;
revoke execute on function public.kr_cold_free_now(uuid[]) from public;
grant execute on function public.kr_cold_free_now(uuid[]) to anon, authenticated;

-- ───────────────────────── the receipt ─────────────────────────
-- Everything the receipt shows, as JSON — only for the farmer who booked
-- ('farmer') and the store's owner ('owner'); anyone else gets null.
create or replace function public.kr_cold_receipt(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.rental_bookings;
  l public.rental_listings;
  viewer text;
begin
  if auth.uid() is null or p_booking is null then return null; end if;
  select * into b from public.rental_bookings where id = p_booking;
  if not found then return null; end if;
  viewer := case when b.renter_id = auth.uid() then 'farmer' when b.owner_id = auth.uid() then 'owner' end;
  if viewer is null then return null; end if;
  select * into l from public.rental_listings where id = b.listing_id;
  return jsonb_build_object(
    'viewer', viewer,
    'booking', jsonb_build_object(
      'id', b.id, 'status', b.status, 'units', b.units, 'months', b.duration, 'start', b.start_date, 'amount', b.amount,
      'payment_ref', b.payment_ref, 'created_at', b.created_at, 'paid_at', b.paid_at, 'confirmed_at', b.confirmed_at,
      'paid_to', b.paid_to, 'farmer_name', b.renter_name, 'farmer_phone', b.renter_phone, 'owner_note', b.owner_note),
    'store', jsonb_build_object(
      'title', l.title, 'owner_name', l.owner_name, 'phone', l.phone, 'manager_name', l.manager_name, 'manager_phone', l.manager_phone,
      'address', l.address, 'area', l.area, 'district', l.district, 'state', l.state, 'rate', l.rate, 'unit', l.unit),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'chamber_id', c.id, 'name', c.name, 'chamber_no', c.chamber_no, 'floor', c.floor, 'position', c.position,
               'storage', c.storage, 'boxes_per_slot', c.boxes_per_slot, 'slot', s.slot,
               'boxes', coalesce(s.boxes, c.boxes_per_slot), 'rate', coalesce(s.rate, c.rate, l.rate), 'rate_kept', s.rate is not null)
             order by c.position, c.name, s.slot)
        from public.cold_slot_bookings s
        join public.cold_chambers c on c.id = s.chamber_id
       where s.booking_id = b.id), '[]'::jsonb)
  );
end $$;
revoke execute on function public.kr_cold_receipt(uuid) from public, anon;
grant execute on function public.kr_cold_receipt(uuid) to authenticated;
