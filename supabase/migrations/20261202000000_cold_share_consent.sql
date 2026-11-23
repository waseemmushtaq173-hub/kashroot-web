-- KashRoot: sharing a bin needs the first farmer's yes.
--
-- A bin (a "place") holds what the owner set, say 100 crates. A small lot leaves room, and that room goes to the next farmer, so
-- bins fill completely. Until now the next farmer could fill it without asking. Now:
--   * Booking a place that already holds another farmer's boxes for overlapping months asks each of those farmers (one row per
--     farmer and place in cold_share_requests). The new booking is made and its places held, as always, for 24 hours, but it
--     cannot be paid (kr_booking_action 'pay') nor confirmed by the owner ('confirm') until every one of them said yes.
--   * The farmer asked sees the request in Cold storage → My bookings (kr_cold_share_inbox) and by e-mail, answers yes or no
--     (kr_cold_share_decide). A no cancels the other farmer's booking at once, so the room goes back and they choose again.
--     No answer in the 24 hours: the hold ends and the request ends with it, the bin stays as it was.
--   * Never who: the farmer asked sees only the other farmer's first name and how many; the other farmer sees only that someone
--     said no, never whom (kr_cold_share_status).
--   * Places with nobody else on them, and bookings made before this, work exactly as before.
-- The table is closed to every browser key: it is read and changed only through the functions below.
-- Run after 20261201000000_close_open_tables.sql. Safe to run again.

create table if not exists public.cold_share_requests (
  id                uuid primary key default gen_random_uuid(),
  -- the next farmer's booking, and the farmer (and booking) already on the place
  booking_id        uuid not null references public.rental_bookings (id) on delete cascade,
  holder_booking_id uuid not null references public.rental_bookings (id) on delete cascade,
  holder_id         uuid not null references auth.users (id) on delete cascade,
  chamber_id        uuid not null references public.cold_chambers (id) on delete cascade,
  slot              text not null check (slot ~ '^[1-9][0-9]?[A-Z]$'),
  boxes             integer not null check (boxes between 1 and 5000),
  state             text not null default 'asked' check (state in ('asked', 'allowed', 'declined')),
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (booking_id, holder_id, chamber_id, slot)
);
create index if not exists cold_share_requests_holder on public.cold_share_requests (holder_id, state, created_at desc);
create index if not exists cold_share_requests_booking on public.cold_share_requests (booking_id);
alter table public.cold_share_requests enable row level security;
select public.kr_close_table('cold_share_requests');

-- ───────────────────────── where a booking stands ─────────────────────────
-- 'none' (nobody else on its places), 'asked' (a farmer who is still on a place has not answered), 'declined', or 'allowed'.
-- A farmer whose own booking has ended (cancelled, or the 24-hour hold ran out) no longer needs asking. Internal.
create or replace function public.kr_cold_share_state(p_booking uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from public.cold_share_requests r where r.booking_id = p_booking) then 'none'
    when exists (select 1 from public.cold_share_requests r where r.booking_id = p_booking and r.state = 'declined') then 'declined'
    when exists (
      select 1 from public.cold_share_requests r
        join public.rental_bookings h on h.id = r.holder_booking_id
       where r.booking_id = p_booking and r.state = 'asked' and public.kr_cold_holds(h.status, h.created_at)
    ) then 'asked'
    else 'allowed'
  end
$$;
revoke all on function public.kr_cold_share_state(uuid) from public, anon, authenticated;

-- ───────────────────────── booking: ask the farmers already on a place ─────────────────────────
-- As in 20261025100000_cold_booking_pay.sql, and, once the places are in, a request to each farmer already on one of them.
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

  -- Sharing: each farmer still on one of these places for overlapping months is asked once for each place.
  insert into public.cold_share_requests (booking_id, holder_booking_id, holder_id, chamber_id, slot, boxes)
  select distinct on (hb.renter_id, (w ->> 'chamber')::uuid, w ->> 'slot')
         booking, hb.id, hb.renter_id, (w ->> 'chamber')::uuid, w ->> 'slot', (w ->> 'boxes')::int
    from jsonb_array_elements(wanted) w
    join public.cold_slot_bookings hs on hs.chamber_id = (w ->> 'chamber')::uuid and hs.slot = w ->> 'slot' and hs.booking_id <> booking
    join public.rental_bookings hb on hb.id = hs.booking_id
   where hb.renter_id <> auth.uid()
     and public.kr_cold_holds(hb.status, hb.created_at)
     and public.kr_cold_period(hb.start_date, hb.duration) && public.kr_cold_period(p_start, p_months)
   order by hb.renter_id, (w ->> 'chamber')::uuid, w ->> 'slot', hb.created_at
  on conflict do nothing;
  return booking;
end $$;
revoke execute on function public.kr_book_cold_places(uuid, text[], date, integer, text, text) from public, anon;
grant execute on function public.kr_book_cold_places(uuid, text[], date, integer, text, text) to authenticated;

-- ───────────────────────── paying and confirming wait for the yes ─────────────────────────
-- From 20261116000000_business_listings.sql, plus: not paid, and not confirmed by the owner, while a farmer on a shared place
-- has not said yes (or said no).
create or replace function public.kr_booking_action(p_booking uuid, p_action text, p_ref text default null, p_note text default null)
returns public.rental_bookings language plpgsql security definer set search_path = public as $$
declare b public.rental_bookings; l public.rental_listings; by_place boolean; clash text; team boolean; share text;
begin
  select * into b from public.rental_bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  select * into l from public.rental_listings where id = b.listing_id for update;
  -- The owner, or anyone in the business the store belongs to (not while KashRoot has paused it).
  team := b.owner_id = auth.uid() or public.kr_listing_team(l.id) is not null;
  by_place := exists (select 1 from public.cold_slot_bookings where booking_id = b.id);
  if by_place then perform pg_advisory_xact_lock(hashtext('cold:' || l.id::text)); end if;
  if p_action = 'pay' then
    if b.renter_id <> auth.uid() then raise exception 'Not your booking'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking can no longer be paid'; end if;
    -- A place that already holds another farmer's bins is shared only when that farmer says yes.
    if by_place then
      share := public.kr_cold_share_state(b.id);
      if share = 'asked' then raise exception 'The farmer who already has bins on a place you chose has not said yes yet. You can pay as soon as they do.'; end if;
      if share = 'declined' then raise exception 'The farmer who already has bins on a place you chose said no. Cancel this booking and choose other places.'; end if;
    end if;
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
    if not team then raise exception 'Only the owner or their team can confirm'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking is already %', b.status; end if;
    if by_place and public.kr_cold_share_state(b.id) in ('asked', 'declined') then
      raise exception 'The farmer who already has bins on a place of this booking has not said yes to sharing it. Wait for the answer, or decline this booking.';
    end if;
    if by_place then
      -- Other farmers' paid or confirmed boxes on the same places and months.
      clash := public.kr_cold_over(b.id, true);
      if clash is not null then raise exception '% is already booked for those months. Decline this booking.', clash; end if;
    else
      if l.available < b.units then raise exception 'Not enough space left: % available', l.available; end if;
      update public.rental_listings set available = available - b.units where id = l.id;
    end if;
    update public.rental_bookings set status = 'confirmed', owner_note = left(p_note, 300), handled_by = auth.uid() where id = p_booking returning * into b;
  elsif p_action = 'reject' then
    if not team then raise exception 'Only the owner or their team can reject'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking is already %', b.status; end if;
    update public.rental_bookings set status = 'rejected', owner_note = left(p_note, 300), handled_by = auth.uid() where id = p_booking returning * into b;
  elsif p_action = 'complete' then
    if not team then raise exception 'Only the owner or their team can close a booking'; end if;
    if b.status <> 'confirmed' then raise exception 'Only confirmed bookings can be completed'; end if;
    if not by_place then update public.rental_listings set available = least(capacity, available + b.units) where id = l.id; end if;
    update public.rental_bookings set status = 'completed', handled_by = auth.uid() where id = p_booking returning * into b;
  else
    raise exception 'Unknown action';
  end if;
  if by_place then perform public.kr_cold_recount(l.id); end if;
  return b;
end $$;

-- ───────────────────────── the farmer asked: the inbox and the answer ─────────────────────────
-- Requests for places the caller is on: the ones waiting (the other farmer's wait is still running) and the ones answered in the
-- last three days. The other farmer is only a first name and how many bins; never a phone or a surname.
create or replace function public.kr_cold_share_inbox()
returns table (request_id uuid, store text, chamber text, place text, storage text, boxes integer, months integer, start_date date, asker text, state text, asked_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, l.title, c.name, public.kr_cold_place_name(c.name, r.slot), c.storage, r.boxes, b.duration, b.start_date,
         coalesce(nullif(split_part(btrim(b.renter_name), ' ', 1), ''), 'A farmer'), r.state, r.created_at, b.created_at + interval '24 hours'
    from public.cold_share_requests r
    join public.rental_bookings b on b.id = r.booking_id
    join public.cold_chambers c on c.id = r.chamber_id
    join public.rental_listings l on l.id = c.listing_id
   where auth.uid() is not null and r.holder_id = auth.uid()
     and (
       (r.state = 'asked' and b.status = 'requested' and b.created_at > now() - interval '24 hours')
       or (r.state <> 'asked' and r.decided_at > now() - interval '3 days')
     )
   order by (r.state = 'asked') desc, r.created_at desc
   limit 50
$$;
revoke all on function public.kr_cold_share_inbox() from public, anon;
grant execute on function public.kr_cold_share_inbox() to authenticated;

-- Say yes or no. Only the farmer asked, only while the other farmer's 24 hours run. A no cancels that booking at once.
create or replace function public.kr_cold_share_decide(p_request uuid, p_allow boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.cold_share_requests;
  b public.rental_bookings;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  if p_allow is null then raise exception 'Say yes or no'; end if;
  select * into r from public.cold_share_requests where id = p_request;
  -- The same words whether it does not exist or is someone else's: ids cannot be probed.
  if not found or r.holder_id <> auth.uid() then raise exception 'This request is not yours to answer'; end if;
  select * into b from public.rental_bookings where id = r.booking_id;
  perform pg_advisory_xact_lock(hashtext('cold:' || b.listing_id::text));
  select * into r from public.cold_share_requests where id = p_request for update;
  select * into b from public.rental_bookings where id = r.booking_id for update;
  if r.state <> 'asked' then raise exception 'You already answered this request'; end if;
  if b.status <> 'requested' or b.created_at <= now() - interval '24 hours' then
    raise exception 'This request has ended: the other farmer''s 24 hours are over';
  end if;
  update public.cold_share_requests set state = case when p_allow then 'allowed' else 'declined' end, decided_at = now() where id = r.id;
  if not p_allow then
    -- The room goes back at once; the other farmer is told and chooses again.
    update public.rental_bookings set status = 'cancelled' where id = b.id;
    perform public.kr_cold_recount(b.listing_id);
  end if;
  return case when p_allow then 'allowed' else 'declined' end;
end $$;
revoke all on function public.kr_cold_share_decide(uuid, boolean) from public, anon;
grant execute on function public.kr_cold_share_decide(uuid, boolean) to authenticated;

-- ───────────────────────── the farmer waiting, and the owner: where a booking stands ─────────────────────────
-- For the caller's own bookings, and those of the stores they run: 'none', 'asked', 'declined' or 'allowed', and how many farmers
-- are still to answer. Never who.
create or replace function public.kr_cold_share_status(p_bookings uuid[])
returns table (booking_id uuid, state text, waiting integer)
language sql stable security definer set search_path = public as $$
  select b.id, public.kr_cold_share_state(b.id),
         (select count(distinct r.holder_id)::int
            from public.cold_share_requests r
            join public.rental_bookings h on h.id = r.holder_booking_id
           where r.booking_id = b.id and r.state = 'asked' and public.kr_cold_holds(h.status, h.created_at))
    from public.rental_bookings b
   where auth.uid() is not null
     and b.id = any ((coalesce(p_bookings, '{}'::uuid[]))[1:100])
     and (b.renter_id = auth.uid() or b.owner_id = auth.uid() or public.kr_listing_team(b.listing_id) is not null)
$$;
revoke all on function public.kr_cold_share_status(uuid[]) from public, anon;
grant execute on function public.kr_cold_share_status(uuid[]) to authenticated;

-- ───────────────────────── e-mail ─────────────────────────
-- Through the e-mail queue (20261108000000_email_outbox.sql). Only the place and how many are named, never a surname or phone.
--   cold_share_ask     to the farmer on the place: another farmer asks to use the room left in the bin
--   cold_share_answer  to the farmer who asked: yes or no
-- A booking must never fail because an e-mail could not be queued: each trigger catches its own errors.
-- The email kinds: the one complete list (newest: this one).
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'help_new', 'help_ack', 'help_reply', 'help_resolved', 'payout_changed', 'password_changed', 'email_changed', 'phone_changed', 'new_signin', 'signin_locked', 'team_changed', 'trip_lost',
  'lab_booking_new', 'lab_booking_cancelled', 'lab_booking_update', 'lab_report_ready',
  'order_new', 'order_farmer_update', 'order_buyer_update',
  'hub_order_new', 'hub_order_packed',
  'cold_share_ask', 'cold_share_answer'));

create or replace function public.kr_email_on_share_asked() returns trigger
language plpgsql security definer set search_path = public as $$
declare what text;
begin
  begin
    select left(new.boxes::text || ' ' || public.kr_cold_word(c.storage, new.boxes) || ' · ' || public.kr_cold_place_name(c.name, new.slot), 80)
      into what from public.cold_chambers c where c.id = new.chamber_id;
    insert into public.email_outbox (kind, user_id, ref, detail)
    values ('cold_share_ask', new.holder_id, 'CS-' || upper(substr(replace(new.booking_id::text, '-', ''), 1, 8)), what);
  exception when others then
    null;
  end;
  return new;
end $$;
revoke all on function public.kr_email_on_share_asked() from public, anon, authenticated;
drop trigger if exists cold_share_requests_email_asked on public.cold_share_requests;
create trigger cold_share_requests_email_asked after insert on public.cold_share_requests for each row execute function public.kr_email_on_share_asked();

create or replace function public.kr_email_on_share_answered() returns trigger
language plpgsql security definer set search_path = public as $$
declare what text; asker uuid;
begin
  begin
    if new.state in ('allowed', 'declined') and old.state = 'asked' then
      select b.renter_id into asker from public.rental_bookings b where b.id = new.booking_id;
      select left(case new.state when 'allowed' then 'Yes: ' else 'No: ' end || new.boxes::text || ' ' || public.kr_cold_word(c.storage, new.boxes) || ' · ' || public.kr_cold_place_name(c.name, new.slot), 80)
        into what from public.cold_chambers c where c.id = new.chamber_id;
      if asker is not null then
        insert into public.email_outbox (kind, user_id, ref, detail)
        values ('cold_share_answer', asker, 'CS-' || upper(substr(replace(new.booking_id::text, '-', ''), 1, 8)), what);
      end if;
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;
revoke all on function public.kr_email_on_share_answered() from public, anon, authenticated;
drop trigger if exists cold_share_requests_email_answered on public.cold_share_requests;
create trigger cold_share_requests_email_answered after update of state on public.cold_share_requests for each row execute function public.kr_email_on_share_answered();

notify pgrst, 'reload schema';
