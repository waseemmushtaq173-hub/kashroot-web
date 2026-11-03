-- KashRoot: Business Owner consoles, stage 2 — a cold store or machine for hire run by a business
-- (20261115000000_business_consoles.sql). The person who listed it, when they own the business too,
-- puts it in the business; then everyone in the business (owner, managers, staff) sees its bookings
-- and receipts, and confirms, declines or completes them — each booking keeps who did. Farmers pay the
-- business's bank / UPI details once the owner has set them (otherwise the lister's own, as before).
-- Changing the store itself (rates, chambers) stays with the person who listed it. While KashRoot has
-- paused a business, its team can do nothing with its stores; the lister still can.
-- Run after 20261115000000_business_consoles.sql. Safe to run again.

alter table public.rental_listings add column if not exists org_id uuid references public.organisations (id) on delete set null;
create index if not exists rental_listings_org on public.rental_listings (org_id) where org_id is not null;
alter table public.rental_bookings add column if not exists handled_by uuid references auth.users (id) on delete set null;

-- The signed-in person's role in the business a store belongs to (null: none, or the business is paused).
create or replace function public.kr_listing_team(p_listing uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role
    from public.rental_listings l
    join public.organisations o on o.id = l.org_id and o.suspended_at is null
    join public.org_members m on m.org_id = o.id and m.user_id = auth.uid()
   where l.id = p_listing
$$;
revoke all on function public.kr_listing_team(uuid) from public, anon;
grant execute on function public.kr_listing_team(uuid) to authenticated;

-- A store goes into a business only by someone who listed it AND owns that business; nobody moves
-- a store to another person. (The listing's own edit policy lets its lister write the row, so this
-- guard is what stops a lister naming a business they do not own.)
create or replace function public.kr_listing_org_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- SQL Editor / migrations
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'A listing stays with the person who listed it.' using errcode = '42501';
  end if;
  if new.org_id is not null and (tg_op = 'INSERT' or new.org_id is distinct from old.org_id) then
    if new.owner_id is distinct from auth.uid() or public.kr_org_role(new.org_id) is distinct from 'owner' then
      raise exception 'Only the owner of the business can put their own store in it.' using errcode = '42501';
    end if;
    perform public.kr_org_writable(new.org_id);
  end if;
  return new;
end $$;
revoke execute on function public.kr_listing_org_guard() from public, anon, authenticated;
drop trigger if exists rental_listings_org_guard on public.rental_listings;
create trigger rental_listings_org_guard before insert or update on public.rental_listings
  for each row execute function public.kr_listing_org_guard();

-- Put a store in a business, or take it out (p_org null).
create or replace function public.kr_org_attach_listing(p_listing uuid, p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.rental_listings where id = p_listing and owner_id = auth.uid()) then
    raise exception 'This is not your listing.' using errcode = '42501';
  end if;
  update public.rental_listings set org_id = p_org where id = p_listing; -- the guard above checks the rest
end $$;
revoke all on function public.kr_org_attach_listing(uuid, uuid) from public, anon;
grant execute on function public.kr_org_attach_listing(uuid, uuid) to authenticated;

-- Where a farmer pays for a booking: the business's details when the store is in a business that
-- has set them and is not paused, otherwise the lister's own (payout_accounts).
create or replace function public.kr_booking_payee(p_listing uuid, p_owner uuid)
returns table (account_name text, upi_id text, account_number text, ifsc text, bank_name text)
language sql stable security definer set search_path = public as $$
  select x.account_name, x.upi_id, x.account_number, x.ifsc, x.bank_name from (
    select p.account_name, p.upi_id, p.account_number, p.ifsc, p.bank_name, 0 as pick
      from public.rental_listings l
      join public.organisations o on o.id = l.org_id and o.suspended_at is null
      join public.org_payout_accounts p on p.org_id = o.id
     where l.id = p_listing
    union all
    select a.account_name, a.upi_id, a.account_number, a.ifsc, a.bank_name, 1
      from public.payout_accounts a where a.user_id = p_owner
  ) x order by x.pick limit 1
$$;
revoke execute on function public.kr_booking_payee(uuid, uuid) from public, anon, authenticated;

-- The business sees its stores (even hidden ones), their bookings and the places booked.
drop policy if exists "Business sees its listings" on public.rental_listings;
create policy "Business sees its listings" on public.rental_listings for select to authenticated
  using (org_id is not null and public.kr_listing_team(id) is not null);
drop policy if exists "Business sees its bookings" on public.rental_bookings;
create policy "Business sees its bookings" on public.rental_bookings for select to authenticated
  using (public.kr_listing_team(listing_id) is not null);
drop policy if exists cold_slot_bookings_team on public.cold_slot_bookings;
create policy cold_slot_bookings_team on public.cold_slot_bookings for select to authenticated
  using (exists (select 1 from public.rental_bookings b where b.id = booking_id and public.kr_listing_team(b.listing_id) is not null));

-- From 20261022000000_cold_shared_places.sql; now the store's team too, and who did it.
create or replace function public.kr_booking_action(p_booking uuid, p_action text, p_ref text default null, p_note text default null)
returns public.rental_bookings language plpgsql security definer set search_path = public as $$
declare b public.rental_bookings; l public.rental_listings; by_place boolean; clash text; team boolean;
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

-- From 20261025100000_cold_booking_pay.sql; "paid to" now the business's details when it has them.
create or replace function public.kr_booking_stamps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.handled_by := null;
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
        from public.kr_booking_payee(new.listing_id, new.owner_id) a
    );
  end if;
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    new.confirmed_at := now();
  end if;
  return new;
end $$;

-- From 20261025100000_cold_booking_pay.sql; the store's team sees the receipt as the owner does.
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
  viewer := case when b.renter_id = auth.uid() then 'farmer'
                 when b.owner_id = auth.uid() or public.kr_listing_team(b.listing_id) is not null then 'owner' end;
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

-- From 20261011000000_kashroot_core.sql; a booking is paid to the business when it has details.
create or replace function public.kr_payment_details(p_kind text, p_id uuid)
returns table (account_name text, upi_id text, account_number text, ifsc text, bank_name text)
language plpgsql stable security definer set search_path = public as $$
declare payee uuid; listing uuid;
begin
  if p_kind = 'booking' then
    select owner_id, listing_id into payee, listing from public.rental_bookings where id = p_id and renter_id = auth.uid() and status in ('requested', 'paid', 'confirmed');
  elsif p_kind = 'order' then
    select seller_id into payee from public.market_orders where id = p_id and buyer_id = auth.uid() and status in ('accepted', 'shipped', 'delivered', 'paid');
  end if;
  if payee is null then return; end if;
  if listing is not null then
    return query select a.account_name, a.upi_id, a.account_number, a.ifsc, a.bank_name from public.kr_booking_payee(listing, payee) a;
    return;
  end if;
  return query select a.account_name, a.upi_id, a.account_number, a.ifsc, a.bank_name from public.payout_accounts a where a.user_id = payee;
end $$;
