-- KashRoot: Business Owner consoles, stage 3 — shop and dealer orders, and drivers, run by a
-- business (20261115000000_business_consoles.sql, 20261116000000_business_listings.sql).
--   * A seller who owns a business puts their own products in it (market_listings.org_id); orders
--     for them carry the business (market_orders.org_id, set from the product when ordered).
--   * Everyone in the business (owner, managers, staff) sees those orders and does the seller's
--     steps: accept or decline, money received, ship, share the location, the driver's link,
--     report a problem. Each order keeps who did it last (handled_by).
--   * Drivers: the owner and managers keep the business's list of drivers (name, mobile, vehicle);
--     anyone in the business ships an order with one of them. Only a driver of the order's own
--     business can be given it.
--   * Buyers pay the business's bank / UPI details once the owner has set them (otherwise the
--     seller's own, as before). KashRoot never holds money.
--   * While KashRoot has paused a business, its team can do nothing with its orders; the seller
--     who listed the product still can. Changing the product itself stays with that seller.
-- Run after 20261116000000_business_listings.sql. Safe to run again; no existing row changes.

alter table public.market_listings add column if not exists org_id uuid references public.organisations (id) on delete set null;
create index if not exists market_listings_org on public.market_listings (org_id) where org_id is not null;
alter table public.market_orders add column if not exists org_id uuid references public.organisations (id) on delete set null;
alter table public.market_orders add column if not exists handled_by uuid references auth.users (id) on delete set null;
create index if not exists market_orders_org on public.market_orders (org_id, created_at desc) where org_id is not null;

-- The signed-in person's role in a business that is not paused (null: none).
create or replace function public.kr_org_active_role(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role
    from public.organisations o
    join public.org_members m on m.org_id = o.id and m.user_id = auth.uid()
   where o.id = p_org and o.suspended_at is null
$$;
revoke all on function public.kr_org_active_role(uuid) from public, anon;
grant execute on function public.kr_org_active_role(uuid) to authenticated;

-- Whether the signed-in person may do the seller's steps on an order: the seller, or anyone in
-- the business the order belongs to (not while it is paused).
create or replace function public.kr_order_team(p_seller uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (p_seller = auth.uid() or (p_org is not null and public.kr_org_active_role(p_org) is not null))
$$;
revoke all on function public.kr_order_team(uuid, uuid) from public, anon;
grant execute on function public.kr_order_team(uuid, uuid) to authenticated;

-- A product goes into a business only by the seller who listed it AND owns that business; nobody
-- moves a product to another person.
create or replace function public.kr_market_listing_org_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- SQL Editor / migrations
  if tg_op = 'UPDATE' and new.seller_id is distinct from old.seller_id then
    raise exception 'A product stays with the seller who listed it.' using errcode = '42501';
  end if;
  if new.org_id is not null and (tg_op = 'INSERT' or new.org_id is distinct from old.org_id) then
    if new.seller_id is distinct from auth.uid() or public.kr_org_role(new.org_id) is distinct from 'owner' then
      raise exception 'Only the owner of the business can put their own product in it.' using errcode = '42501';
    end if;
    perform public.kr_org_writable(new.org_id);
  end if;
  return new;
end $$;
revoke execute on function public.kr_market_listing_org_guard() from public, anon, authenticated;
drop trigger if exists market_listings_org_guard on public.market_listings;
create trigger market_listings_org_guard before insert or update on public.market_listings
  for each row execute function public.kr_market_listing_org_guard();

-- Put a product in a business, or take it out (p_org null). Orders already made keep theirs.
create or replace function public.kr_org_attach_product(p_listing uuid, p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.market_listings where id = p_listing and seller_id = auth.uid()) then
    raise exception 'This is not your product.' using errcode = '42501';
  end if;
  update public.market_listings set org_id = p_org where id = p_listing; -- the guard above checks the rest
end $$;
revoke all on function public.kr_org_attach_product(uuid, uuid) from public, anon;
grant execute on function public.kr_org_attach_product(uuid, uuid) to authenticated;

-- A new order belongs to its product's business (after market_orders_before has set the seller);
-- nobody changes it later, and who handled it starts empty.
create or replace function public.kr_order_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.org_id := (select l.org_id from public.market_listings l where l.id = new.listing_id);
    new.handled_by := null;
  else
    new.org_id := old.org_id;
  end if;
  return new;
end $$;
revoke execute on function public.kr_order_org() from public, anon, authenticated;
drop trigger if exists market_orders_org on public.market_orders;
create trigger market_orders_org before insert or update on public.market_orders
  for each row execute function public.kr_order_org();

-- Where a buyer pays for an order: the business's details when the order is in a business that
-- has set them and is not paused, otherwise the seller's own (payout_accounts).
create or replace function public.kr_order_payee(p_org uuid, p_seller uuid)
returns table (account_name text, upi_id text, account_number text, ifsc text, bank_name text)
language sql stable security definer set search_path = public as $$
  select x.account_name, x.upi_id, x.account_number, x.ifsc, x.bank_name from (
    select p.account_name, p.upi_id, p.account_number, p.ifsc, p.bank_name, 0 as pick
      from public.organisations o
      join public.org_payout_accounts p on p.org_id = o.id
     where o.id = p_org and o.suspended_at is null
    union all
    select a.account_name, a.upi_id, a.account_number, a.ifsc, a.bank_name, 1
      from public.payout_accounts a where a.user_id = p_seller
  ) x order by x.pick limit 1
$$;
revoke execute on function public.kr_order_payee(uuid, uuid) from public, anon, authenticated;

-- The business sees its products (even hidden ones) and their orders.
drop policy if exists "Business sees its products" on public.market_listings;
create policy "Business sees its products" on public.market_listings for select to authenticated
  using (org_id is not null and public.kr_org_active_role(org_id) is not null);
drop policy if exists "Business sees its orders" on public.market_orders;
create policy "Business sees its orders" on public.market_orders for select to authenticated
  using (org_id is not null and public.kr_org_active_role(org_id) is not null);

-- ───────────────────────── drivers ─────────────────────────
create table if not exists public.org_drivers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  phone      text not null check (phone ~ '^[6-9][0-9]{9}$'),
  vehicle    text check (vehicle is null or char_length(vehicle) between 2 and 40),
  added_by   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, phone)
);
alter table public.org_drivers enable row level security;
revoke all on public.org_drivers from anon, authenticated;
grant select on public.org_drivers to authenticated;
drop policy if exists "Business sees its drivers" on public.org_drivers;
create policy "Business sees its drivers" on public.org_drivers for select to authenticated
  using (public.kr_org_role(org_id) is not null);

-- Add a driver (or change the name / vehicle of one with the same mobile). Owner and managers.
create or replace function public.kr_org_driver_save(p_org uuid, p_name text, p_phone text, p_vehicle text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); v text := upper(nullif(btrim(coalesce(p_vehicle, '')), '')); k uuid;
begin
  if coalesce(public.kr_org_role(p_org), '') not in ('owner', 'manager') then
    raise exception 'Only the owner or a manager can change the drivers.' using errcode = '42501';
  end if;
  perform public.kr_org_writable(p_org);
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then raise exception 'Write the driver’s name.'; end if;
  if char_length(ph) = 12 and ph like '91%' then ph := substr(ph, 3); end if;
  if ph !~ '^[6-9][0-9]{9}$' then raise exception 'Write the driver’s 10-digit mobile number, for example 9876543210.'; end if;
  if v is not null and char_length(v) not between 2 and 40 then raise exception 'Write the vehicle number, for example JK01 AB 1234 — or leave it empty.'; end if;
  if (select count(*) from public.org_drivers where org_id = p_org) >= 200 then raise exception 'A business can keep up to 200 drivers.'; end if;
  insert into public.org_drivers (org_id, name, phone, vehicle, added_by)
  values (p_org, btrim(p_name), ph, v, auth.uid())
  on conflict (org_id, phone) do update set name = excluded.name, vehicle = excluded.vehicle
  returning id into k;
  return k;
end $$;
revoke all on function public.kr_org_driver_save(uuid, text, text, text) from public, anon;
grant execute on function public.kr_org_driver_save(uuid, text, text, text) to authenticated;

create or replace function public.kr_org_driver_remove(p_driver uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.org_drivers;
begin
  select * into d from public.org_drivers where id = p_driver;
  if not found or coalesce(public.kr_org_role(d.org_id), '') not in ('owner', 'manager') then
    raise exception 'Only the owner or a manager can change the drivers.' using errcode = '42501';
  end if;
  perform public.kr_org_writable(d.org_id);
  delete from public.org_drivers where id = p_driver;
end $$;
revoke all on function public.kr_org_driver_remove(uuid) from public, anon;
grant execute on function public.kr_org_driver_remove(uuid) to authenticated;

-- ───────────── the seller's steps: the seller, or their business's team ─────────────
-- From 20261026000000_shop_orders.sql; the seller's steps are now also for everyone in the business
-- the order belongs to (kr_order_team), the order keeps who did them, and a business's own bank /
-- UPI details count as "where buyers pay first".
create or replace function public.kr_shop_step(o public.market_orders, p_action text, p_ref text, p_note text)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare r public.market_orders; l public.market_listings; b uuid := o.basket;
begin
  perform 1 from public.market_orders where basket = b for update;
  if p_action = 'accept' then
    if o.status <> 'placed' then raise exception 'This order is already %', o.status; end if;
    if not exists (select 1 from public.kr_order_payee(o.org_id, o.seller_id)) then
      raise exception 'Add where buyers pay first (UPI ID or bank account): the business’s in My business, or your own. Then accept the order.';
    end if;
    for r in select * from public.market_orders where basket = b order by created_at loop
      select * into l from public.market_listings where id = r.listing_id for update;
      if found then
        if l.quantity < r.quantity then
          raise exception 'Only % % of % left in stock. Add stock first, or decline the order.', trim_scale(l.quantity), l.unit, l.product;
        end if;
        update public.market_listings set quantity = quantity - r.quantity where id = l.id;
      end if;
    end loop;
    update public.market_orders set status = 'accepted', seller_note = coalesce(left(p_note, 300), seller_note) where basket = b;
  elsif p_action = 'reject' then
    if o.status <> 'placed' then raise exception 'This order is already %', o.status; end if;
    update public.market_orders set status = 'rejected', seller_note = left(p_note, 300) where basket = b;
  elsif p_action = 'cancel' then
    if o.status = 'placed' then
      update public.market_orders set status = 'cancelled' where basket = b;
    elsif o.status = 'accepted' and o.payment_state = 'unpaid' then
      perform public.kr_shop_restock(b);
      update public.market_orders set status = 'cancelled' where basket = b;
    elsif o.status = 'accepted' then
      raise exception 'You have already paid for this order. Call the seller, or press “Report a problem”.';
    else
      raise exception 'This order is already %. It cannot be cancelled now.', o.status;
    end if;
  elsif p_action = 'seller_cancel' then
    if not (o.status = 'accepted' and o.payment_state = 'unpaid') then raise exception 'You can cancel only while the buyer has not paid'; end if;
    -- The buyer gave a payment reference: the seller cannot just cancel it away.
    if o.payment_ref is not null then
      raise exception 'The buyer says they paid (reference %). Check your bank or UPI app again, or call the buyer. If the money did not come, press “Report a problem”.', o.payment_ref;
    end if;
    perform public.kr_shop_restock(b);
    update public.market_orders set status = 'cancelled', seller_note = coalesce(left(p_note, 300), 'Cancelled by the seller: the payment did not come.') where basket = b;
  elsif p_action = 'pay' then
    if o.status = 'placed' then raise exception 'Wait until the seller accepts the order. Then pay.'; end if;
    if o.status <> 'accepted' then raise exception 'This order is already %', o.status; end if;
    if o.payment_state = 'received' then raise exception 'The seller has already confirmed your payment'; end if;
    if p_ref is null or p_ref !~ '^[A-Za-z0-9]{6,30}$' then
      raise exception 'Enter the payment reference (UTR) from your UPI app or bank: 6 to 30 letters or numbers, no spaces.';
    end if;
    -- A new payment: an older "money not received" note no longer applies.
    update public.market_orders set payment_state = 'paid', payment_ref = p_ref, paid_at = now(), seller_note = null where basket = b;
  elsif p_action in ('confirm_payment', 'not_received') then
    -- "Money received" also works after "not received", when the money came late.
    if o.status <> 'accepted' or not (o.payment_state = 'paid' or (p_action = 'confirm_payment' and o.payment_state = 'unpaid' and o.payment_ref is not null)) then
      raise exception 'The buyer has not marked this order paid yet';
    end if;
    if p_action = 'confirm_payment' then
      update public.market_orders set payment_state = 'received', payment_confirmed_at = now(), seller_note = null where basket = b;
    else
      update public.market_orders set payment_state = 'unpaid', seller_note = coalesce(left(p_note, 300), 'The money has not reached the seller yet.') where basket = b;
    end if;
  elsif p_action = 'ship' then
    raise exception 'Write the vehicle or courier first, then press “Mark shipped”';
  elsif p_action = 'delivered' then
    if o.status <> 'shipped' then raise exception 'The seller has not shipped this order yet'; end if;
    update public.market_orders set status = 'completed', delivered_at = now() where basket = b;
  elsif p_action in ('dispute', 'seller_dispute') then
    -- "Report a problem", by the buyer or (for a payment the seller cannot
    -- find) the seller. KashRoot's admins see it. Not shipped yet: the goods
    -- are still with the seller, so their stock goes back on sale.
    if o.status = 'placed' then raise exception 'The seller has not accepted this order yet. Press “Cancel order” instead.'; end if;
    if o.status = 'disputed' then raise exception 'A problem is already reported on this order.'; end if;
    if o.status not in ('accepted', 'shipped') then raise exception 'This order is already %. A problem cannot be reported now.', o.status; end if;
    if btrim(coalesce(p_note, '')) = '' then raise exception 'Write what went wrong, for example: wrong item, broken, not delivered, money not received.'; end if;
    if o.status = 'accepted' then perform public.kr_shop_restock(b); end if;
    if p_action = 'dispute' then
      update public.market_orders set status = 'disputed', buyer_note = left(btrim(p_note), 300) where basket = b;
    else
      update public.market_orders set status = 'disputed', seller_note = left(btrim(p_note), 300) where basket = b;
    end if;
  end if;
  select * into r from public.market_orders where id = o.id;
  return r;
end $$;

create or replace function public.kr_order_action(p_order uuid, p_action text, p_ref text default null, p_note text default null)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders; l public.market_listings; seller boolean := false;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if p_action in ('accept', 'reject', 'ship', 'confirm_payment', 'not_received', 'seller_cancel', 'seller_dispute') then
    if not public.kr_order_team(o.seller_id, o.org_id) then raise exception 'Only the seller or their business team can do this'; end if;
    seller := true;
  elsif p_action in ('cancel', 'delivered', 'pay', 'dispute') then
    if o.buyer_id is distinct from auth.uid() then raise exception 'Only the buyer can do this'; end if;
  else
    raise exception 'Unknown action';
  end if;
  if o.pay_first and o.basket is not null then
    o := public.kr_shop_step(o, p_action, p_ref, p_note);
    -- Who in the business did it (the whole basket).
    if seller then update public.market_orders set handled_by = auth.uid() where basket = o.basket; select * into o from public.market_orders where id = p_order; end if;
    return o;
  end if;
  if p_action in ('not_received', 'seller_cancel', 'seller_dispute') then raise exception 'Unknown action'; end if;

  if p_action = 'accept' then
    if o.status <> 'placed' then raise exception 'Order is already %', o.status; end if;
    select * into l from public.market_listings where id = o.listing_id for update;
    if found then
      if l.quantity < o.quantity then raise exception 'Only % % left in stock', l.quantity, l.unit; end if;
      update public.market_listings set quantity = quantity - o.quantity where id = l.id;
    end if;
    update public.market_orders set status = 'accepted', seller_note = left(p_note, 300) where id = p_order returning * into o;
  elsif p_action = 'reject' then
    if o.status <> 'placed' then raise exception 'Order is already %', o.status; end if;
    update public.market_orders set status = 'rejected', seller_note = left(p_note, 300) where id = p_order returning * into o;
  elsif p_action = 'ship' then
    if o.status <> 'accepted' then raise exception 'Accept the order first'; end if;
    update public.market_orders set status = 'shipped', shipped_at = now(), seller_note = coalesce(left(p_note, 300), seller_note) where id = p_order returning * into o;
  elsif p_action = 'cancel' then
    if o.status <> 'placed' then raise exception 'The seller has already accepted this order'; end if;
    update public.market_orders set status = 'cancelled' where id = p_order returning * into o;
  elsif p_action = 'delivered' then
    if o.status not in ('accepted', 'shipped') then raise exception 'Order is %', o.status; end if;
    update public.market_orders set status = 'delivered', delivered_at = now() where id = p_order returning * into o;
  elsif p_action = 'pay' then
    if o.status not in ('delivered', 'paid') then raise exception 'Confirm the delivery first'; end if;
    if p_ref is null or p_ref !~ '^[A-Za-z0-9]{6,30}$' then raise exception 'Enter the 12-digit UPI reference (UTR) from your payment app'; end if;
    update public.market_orders set status = 'paid', payment_ref = p_ref, paid_at = now() where id = p_order returning * into o;
  elsif p_action = 'dispute' then
    if o.status in ('completed', 'cancelled', 'rejected') then raise exception 'Order is %', o.status; end if;
    update public.market_orders set status = 'disputed', buyer_note = left(p_note, 300) where id = p_order returning * into o;
  elsif p_action = 'confirm_payment' then
    if o.status <> 'paid' then raise exception 'The buyer has not marked this order paid yet'; end if;
    update public.market_orders set status = 'completed', payment_confirmed_at = now() where id = p_order returning * into o;
  end if;
  if seller then update public.market_orders set handled_by = auth.uid() where id = p_order returning * into o; end if;
  return o;
end $$;

create or replace function public.kr_order_ship(p_order uuid, p_vehicle text, p_driver_name text default null, p_driver_phone text default null, p_note text default null)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders; v text := btrim(coalesce(p_vehicle, '')); ph text := regexp_replace(coalesce(p_driver_phone, ''), '\D', '', 'g');
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.kr_order_team(o.seller_id, o.org_id) then raise exception 'Only the seller or their business team can do this'; end if;
  if o.status not in ('accepted', 'shipped') then raise exception 'This order is %. It cannot be shipped now.', o.status; end if;
  if o.pay_first and o.status = 'accepted' and o.payment_state is distinct from 'received' then
    raise exception 'Ship after the money reaches you. First press “Money received”.';
  end if;
  if char_length(v) < 2 or char_length(v) > 40 then
    raise exception 'Write the vehicle number or the courier name (for example JK01 AB 1234, or India Post).';
  end if;
  if char_length(ph) = 12 and ph like '91%' then ph := substr(ph, 3); end if;
  if ph <> '' and ph !~ '^[6-9][0-9]{9}$' then
    raise exception 'Write the driver’s 10-digit mobile number (for example 9876543210), or leave it empty.';
  end if;
  update public.market_orders
     set status = 'shipped', shipped_at = coalesce(shipped_at, now()), ship_vehicle = upper(v),
         driver_name = nullif(left(btrim(coalesce(p_driver_name, '')), 80), ''), driver_phone = nullif(ph, ''),
         seller_note = coalesce(left(nullif(btrim(p_note), ''), 300), seller_note), handled_by = auth.uid()
   where (o.basket is not null and basket = o.basket) or (o.basket is null and id = o.id);
  select * into o from public.market_orders where id = p_order;
  return o;
end $$;

create or replace function public.kr_order_location(p_order uuid, p_lat double precision, p_lon double precision, p_accuracy real default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare o public.market_orders;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Bad location'; end if;
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.kr_order_team(o.seller_id, o.org_id) then raise exception 'Only the seller or their business team can do this'; end if;
  if o.status = 'accepted' or o.status = 'placed' then raise exception 'Share the location after the order is shipped'; end if;
  if o.status <> 'shipped' then raise exception 'This order is not on the way any more. Sharing the location has stopped.'; end if;
  if o.last_at is not null and o.last_at > now() - interval '10 seconds' then return o.last_at; end if;
  update public.market_orders set last_lat = p_lat, last_lon = p_lon, last_accuracy = p_accuracy, last_at = now()
   where (o.basket is not null and basket = o.basket) or (o.basket is null and id = o.id);
  return now();
end $$;

create or replace function public.kr_order_driver_link(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o public.market_orders; k uuid; t text;
begin
  select * into o from public.market_orders where id = p_order;
  if not found then raise exception 'Order not found'; end if;
  if not public.kr_order_team(o.seller_id, o.org_id) then raise exception 'Only the seller or their business team can do this'; end if;
  if o.status not in ('accepted', 'shipped') or (o.pay_first and o.status = 'accepted' and o.payment_state is distinct from 'received') then
    raise exception 'Make the driver link when the order is ready to ship';
  end if;
  k := coalesce(o.basket, o.id);
  insert into public.market_order_drivers (basket) values (k) on conflict (basket) do nothing;
  select token into t from public.market_order_drivers where basket = k;
  return t;
end $$;

-- Ship an order with one of the business's drivers: their name and mobile go on the order (the
-- buyer can call them), and their vehicle unless another is written. Only a driver of the order's
-- own business; anyone in that business may do it.
create or replace function public.kr_order_assign_driver(p_order uuid, p_driver uuid, p_vehicle text default null, p_note text default null)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders; d public.org_drivers;
begin
  select * into o from public.market_orders where id = p_order;
  if not found then raise exception 'Order not found'; end if;
  if o.org_id is null or public.kr_org_active_role(o.org_id) is null then
    raise exception 'Only the business''s team can give this order to one of its drivers.' using errcode = '42501';
  end if;
  select * into d from public.org_drivers where id = p_driver and org_id = o.org_id;
  if not found then raise exception 'That driver is not in this business''s list.'; end if;
  return public.kr_order_ship(p_order, coalesce(nullif(btrim(coalesce(p_vehicle, '')), ''), d.vehicle), d.name, d.phone, p_note);
end $$;
revoke all on function public.kr_order_assign_driver(uuid, uuid, text, text) from public, anon;
grant execute on function public.kr_order_assign_driver(uuid, uuid, text, text) to authenticated;

-- From 20261116000000_business_listings.sql; an order in a business is now paid to the business's
-- details when it has them (kr_order_payee), like a booking.
create or replace function public.kr_payment_details(p_kind text, p_id uuid)
returns table (account_name text, upi_id text, account_number text, ifsc text, bank_name text)
language plpgsql stable security definer set search_path = public as $$
declare payee uuid; listing uuid; org uuid;
begin
  if p_kind = 'booking' then
    select owner_id, listing_id into payee, listing from public.rental_bookings where id = p_id and renter_id = auth.uid() and status in ('requested', 'paid', 'confirmed');
  elsif p_kind = 'order' then
    select seller_id, org_id into payee, org from public.market_orders where id = p_id and buyer_id = auth.uid() and status in ('accepted', 'shipped', 'delivered', 'paid');
  end if;
  if payee is null then return; end if;
  if listing is not null then
    return query select a.account_name, a.upi_id, a.account_number, a.ifsc, a.bank_name from public.kr_booking_payee(listing, payee) a;
    return;
  end if;
  return query select a.account_name, a.upi_id, a.account_number, a.ifsc, a.bank_name from public.kr_order_payee(org, payee) a;
end $$;

notify pgrst, 'reload schema';
