-- KashRoot: real-time mutual order GPS tracking, the true five-step order
-- lifecycle with escrow, and 100% Super Admin order visibility.
--
--   * market_orders grows two live GPS streams: the seller's origin
--     (orchard / pickup point — seller_live_*) and the buyer's live
--     destination (buyer_live_*), plus an escrow ledger (escrow_status
--     locked → released / refunded with timestamps) and accepted_at so the
--     five steps (placed → accepted → shipped → delivered → completed)
--     keep the time each was reached.
--   * kr_before_order keeps forcing a fresh insert to status 'placed' (a new
--     order is never "on the way"), pins seller identity from the listing as
--     before, and now locks the escrow on every new pay-after-delivery
--     order. Existing open orders are backfilled as locked. Kissan Tools
--     pay-first baskets are not escrowed — they keep their own payment flow.
--   * New RPCs:
--       kr_order_seller_gps — the seller (or their business team) pins the
--         dispatch origin and keeps it live.
--       kr_order_buyer_gps  — the buyer pins their live destination and
--         streams it while the order is open (fills delivery_lat/lon once).
--       kr_order_arrive     — the seller marks "Arrived at Buyer Location".
--       kr_order_release    — the buyer confirms delivery received: the
--         escrow releases to the farmer and the order completes.
--       kr_admin_orders     — admins read 100% of platform orders with full
--         specs, both GPS streams and the farmer's payout details.
--       kr_admin_escrow     — the Super Admin releases / refunds the escrow
--         (audited in audit_log).
--   * Admins (two-step sign-in + access code, kr_has_role('ADMIN')) now
--     SELECT every order, not only "disputed" ones.
-- Run after 20261121000000_listing_packing_layers.sql. Safe to run again;
-- no existing row changes (the backfill only fills empty escrow columns).

alter table public.market_orders
  add column if not exists seller_live_lat double precision,
  add column if not exists seller_live_lng double precision,
  add column if not exists seller_gps_accuracy real,
  add column if not exists seller_live_address text,
  add column if not exists seller_gps_updated_at timestamptz,
  add column if not exists buyer_live_lat double precision,
  add column if not exists buyer_live_lng double precision,
  add column if not exists buyer_gps_accuracy real,
  add column if not exists buyer_live_address text,
  add column if not exists buyer_gps_updated_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists escrow_status text check (escrow_status in ('locked', 'released', 'refunded')),
  add column if not exists escrow_locked_at timestamptz,
  add column if not exists escrow_released_at timestamptz;

create index if not exists market_orders_escrow on public.market_orders (escrow_status) where escrow_status is not null;

-- Every open pay-after-delivery order joins the escrow ledger as already
-- locked, so the live order shows "Payment in Escrow" from here on.
update public.market_orders
   set escrow_status = 'locked', escrow_locked_at = created_at
 where escrow_status is null and not coalesce(pay_first, false)
   and status in ('placed', 'accepted', 'shipped', 'delivered', 'paid', 'disputed');

-- kr_before_order from 20261026000000_shop_orders.sql, extended: the new
-- columns start null, and a pay-after-delivery order locks its escrow at the
-- moment it is placed. A new order is never set to "on the way" here.
create or replace function public.kr_before_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.market_listings; other public.market_orders;
begin
  select * into l from public.market_listings where id = new.listing_id;
  if not found or not l.active then raise exception 'This product is no longer listed'; end if;
  if l.seller_id = new.buyer_id then raise exception 'You cannot order your own product'; end if;
  if new.quantity > l.quantity then
    raise exception 'Only % % of % left. Order % or less.', trim_scale(l.quantity), l.unit, l.product, trim_scale(l.quantity);
  end if;
  new.seller_id := l.seller_id;
  new.seller_name := l.seller_name;
  new.seller_phone := l.phone;
  new.seller_district := l.district;
  new.product := l.product || coalesce(' · ' || l.variety, '');
  new.unit := l.unit;
  new.unit_price := l.price;
  new.amount := round(l.price * new.quantity, 2);
  new.status := 'placed';
  new.payment_ref := null;
  new.seller_note := null;
  new.pay_first := coalesce(new.pay_first, false);
  if new.pay_first then
    if l.category <> 'supplies' then raise exception 'Paying first is only for farm tools and inputs'; end if;
    new.basket := coalesce(new.basket, gen_random_uuid());
    select * into other from public.market_orders where basket = new.basket limit 1;
    if found and (other.buyer_id <> new.buyer_id or other.seller_id <> new.seller_id or other.status <> 'placed' or not other.pay_first) then
      raise exception 'One order can hold products from one seller only';
    end if;
    new.payment_state := 'unpaid';
  else
    new.basket := null;
    new.payment_state := null;
  end if;
  new.paid_at := null;
  new.payment_confirmed_at := null;
  new.shipped_at := null;
  new.delivered_at := null;
  new.ship_vehicle := null;
  new.driver_name := null;
  new.driver_phone := null;
  new.last_lat := null;
  new.last_lon := null;
  new.last_accuracy := null;
  new.last_at := null;
  new.accepted_at := null;
  new.escrow_status := null;
  new.escrow_locked_at := null;
  new.escrow_released_at := null;
  -- The seller's origin GPS is set only by kr_order_seller_gps after acceptance:
  -- the buyer can never write it at insert time.
  new.seller_live_lat := null;
  new.seller_live_lng := null;
  new.seller_gps_accuracy := null;
  new.seller_live_address := null;
  new.seller_gps_updated_at := null;
  -- The buyer's own destination GPS from the checkout is trusted (their order);
  -- anything sent stays, and reaching "locked" keeps its moment.
  if new.buyer_live_lat is not null or new.buyer_live_address is not null then
    new.buyer_gps_updated_at := now();
  end if;
  if not new.pay_first then
    new.escrow_status := 'locked';
    new.escrow_locked_at := now();
  end if;
  return new;
end $$;

-- Reaching "Accepted by Farmer · Packing" keeps its time (both the single
-- order path and the pay-first basket path go through this UPDATE).
create or replace function public.kr_order_lifecycle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;
  return new;
end $$;
revoke execute on function public.kr_order_lifecycle() from public, anon, authenticated;
drop trigger if exists market_orders_lifecycle on public.market_orders;
create trigger market_orders_lifecycle before update on public.market_orders
  for each row execute function public.kr_order_lifecycle();

-- ───────────── the seller's live GPS: origin and transit ─────────────
create or replace function public.kr_order_seller_gps(p_order uuid, p_lat double precision, p_lon double precision, p_accuracy real default null, p_address text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare o public.market_orders;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Bad location'; end if;
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.kr_order_team(o.seller_id, o.org_id) then raise exception 'Only the seller or their business team can do this'; end if;
  if o.status in ('completed', 'cancelled', 'rejected') then raise exception 'This order is closed. Sharing GPS has stopped.'; end if;
  if o.seller_gps_updated_at is not null and o.seller_gps_updated_at > now() - interval '10 seconds' then return o.seller_gps_updated_at; end if;
  update public.market_orders
     set seller_live_lat = p_lat, seller_live_lng = p_lon, seller_gps_accuracy = p_accuracy,
         seller_live_address = nullif(left(btrim(coalesce(p_address, '')), 200), ''),
         seller_gps_updated_at = now()
   where (o.basket is not null and basket = o.basket) or (o.basket is null and id = o.id);
  return now();
end $$;
revoke all on function public.kr_order_seller_gps(uuid, double precision, double precision, real, text) from public, anon;
grant execute on function public.kr_order_seller_gps(uuid, double precision, double precision, real, text) to authenticated;

-- The buyer's live GPS: their destination and where they are now, streamed
-- while the order is open. Fills the delivery point once, so the seller sees
-- the exact place to drive to even on orders made before it.
create or replace function public.kr_order_buyer_gps(p_order uuid, p_lat double precision, p_lon double precision, p_accuracy real default null, p_address text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare o public.market_orders;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Bad location'; end if;
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.buyer_id is distinct from auth.uid() then raise exception 'Only the buyer can do this'; end if;
  if o.status in ('completed', 'cancelled', 'rejected') then raise exception 'This order is closed. Sharing GPS has stopped.'; end if;
  if o.buyer_gps_updated_at is not null and o.buyer_gps_updated_at > now() - interval '10 seconds' then return o.buyer_gps_updated_at; end if;
  update public.market_orders
     set buyer_live_lat = p_lat, buyer_live_lng = p_lon, buyer_gps_accuracy = p_accuracy,
         buyer_live_address = nullif(left(btrim(coalesce(p_address, '')), 200), ''),
         buyer_gps_updated_at = now(),
         delivery_lat = coalesce(delivery_lat, p_lat), delivery_lon = coalesce(delivery_lon, p_lon)
   where (o.basket is not null and basket = o.basket) or (o.basket is null and id = o.id);
  return now();
end $$;
revoke all on function public.kr_order_buyer_gps(uuid, double precision, double precision, real, text) from public, anon;
grant execute on function public.kr_order_buyer_gps(uuid, double precision, double precision, real, text) to authenticated;

-- "Arrived at Buyer Location" — the seller's step 3, after accepting and
-- dispatching: the goods are at the buyer's place, waiting for their check
-- and confirmation.
create or replace function public.kr_order_arrive(p_order uuid)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.kr_order_team(o.seller_id, o.org_id) then raise exception 'Only the seller or their business team can do this'; end if;
  if o.status not in ('accepted', 'shipped') then raise exception 'This order is %. It cannot arrive now.', o.status; end if;
  update public.market_orders
     set status = 'delivered', delivered_at = coalesce(delivered_at, now()), handled_by = auth.uid()
   where id = p_order returning * into o;
  return o;
end $$;
revoke all on function public.kr_order_arrive(uuid) from public, anon;
grant execute on function public.kr_order_arrive(uuid) to authenticated;

-- "✅ Confirm Delivery Received" — the buyer's final step: the escrow
-- releases to the farmer and the order completes (the farmer's "Money
-- received" counts completed orders, so it rises with the release).
create or replace function public.kr_order_release(p_order uuid)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.buyer_id is distinct from auth.uid() then raise exception 'Only the buyer can confirm the delivery'; end if;
  if o.pay_first then raise exception 'This Kissan Tools order completes through the seller confirming the money.'; end if;
  if o.status not in ('shipped', 'delivered', 'paid') then raise exception 'The goods have not reached you yet'; end if;
  if o.escrow_status is not null and o.escrow_status <> 'locked' then raise exception 'The escrow is already %', o.escrow_status; end if;
  update public.market_orders
     set status = 'completed', delivered_at = coalesce(delivered_at, now()),
         escrow_status = 'released', escrow_released_at = now(),
         payment_confirmed_at = coalesce(payment_confirmed_at, now())
   where id = p_order returning * into o;
  return o;
end $$;
revoke all on function public.kr_order_release(uuid) from public, anon;
grant execute on function public.kr_order_release(uuid) to authenticated;

-- Admins (two-step + access code) read every order, not only disputed ones
-- (...which stays true from 20261117000000_kashroot_team.sql).
drop policy if exists "Admins see every order" on public.market_orders;
create policy "Admins see every order" on public.market_orders for select to authenticated
  using (public.kr_has_role('ADMIN'));

-- ───────────── Super Admin: 100% of orders, live pins, escrow ledger ─────────────
-- 100% of platform orders with the full spec, both live GPS streams, the
-- packing layers and the farmer's / business's payout details (kr_order_payee
-- picks the business's details when the order is in one that has them).
create or replace function public.kr_admin_orders()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.kr_has_role('ADMIN') then
    raise exception 'Only KashRoot admins can see the platform orders.' using errcode = '42501';
  end if;
  with x as (
    select jsonb_build_object(
      'id', o.id, 'created_at', o.created_at, 'status', o.status,
      'product', o.product, 'quantity', o.quantity, 'unit', o.unit,
      'unit_price', o.unit_price, 'amount', o.amount,
      'buyer_id', o.buyer_id, 'buyer_name', o.buyer_name, 'buyer_phone', o.buyer_phone,
      'buyer_note', o.buyer_note, 'seller_note', o.seller_note,
      'delivery_address', o.delivery_address, 'delivery_lat', o.delivery_lat, 'delivery_lon', o.delivery_lon,
      'buyer_live_lat', o.buyer_live_lat, 'buyer_live_lng', o.buyer_live_lng,
      'buyer_live_address', o.buyer_live_address, 'buyer_gps_updated_at', o.buyer_gps_updated_at, 'buyer_gps_accuracy', o.buyer_gps_accuracy,
      'seller_id', o.seller_id, 'seller_name', o.seller_name, 'seller_phone', o.seller_phone, 'seller_district', o.seller_district,
      'seller_live_lat', o.seller_live_lat, 'seller_live_lng', o.seller_live_lng,
      'seller_live_address', o.seller_live_address, 'seller_gps_updated_at', o.seller_gps_updated_at, 'seller_gps_accuracy', o.seller_gps_accuracy,
      'last_lat', o.last_lat, 'last_lon', o.last_lon, 'last_accuracy', o.last_accuracy, 'last_at', o.last_at,
      'ship_vehicle', o.ship_vehicle, 'driver_name', o.driver_name, 'driver_phone', o.driver_phone, 'shipped_at', o.shipped_at,
      'pay_first', o.pay_first, 'payment_state', o.payment_state, 'payment_ref', o.payment_ref,
      'escrow_status', o.escrow_status, 'escrow_locked_at', o.escrow_locked_at, 'escrow_released_at', o.escrow_released_at,
      'payment_shared', (o.pay_first is true),
      'grade', l.grade, 'category', l.category,
      'box_capacity_kg', l.box_capacity_kg, 'packing_layers', l.packing_layers, 'apples_per_box', l.apples_per_box,
      'payee_name', p.account_name, 'payee_upi_id', p.upi_id, 'payee_account_number', p.account_number,
      'payee_ifsc', p.ifsc, 'payee_bank_name', p.bank_name
    ) as j, o.created_at as j_created
      from public.market_orders o
      left join public.market_listings l on l.id = o.listing_id
      left join lateral public.kr_order_payee(o.org_id, o.seller_id) p on true
      limit 2000
  )
  select coalesce(jsonb_agg(x.j order by x.j_created desc), '[]'::jsonb) into v from x;
  return v;
end $$;
revoke all on function public.kr_admin_orders() from public, anon;
grant execute on function public.kr_admin_orders() to authenticated;

-- The Super Admin's escrow controls: release (the goods arrived and are
-- accepted) or refund (return the buyer's money — closes the order and puts
-- accepted stock back). Both audited in audit_log with the reason.
create or replace function public.kr_admin_escrow(p_order uuid, p_action text, p_reason text default null)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders; before jsonb; s text;
begin
  if not public.kr_is_super_admin() then
    raise exception 'Only the Super Admin can control the escrow.' using errcode = '42501';
  end if;
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.pay_first then raise exception 'Kissan Tools pay-first orders hold no escrow (the buyer pays the seller directly).'; end if;
  s := coalesce(btrim(coalesce(p_reason, '')), '');
  if char_length(s) < 5 then raise exception 'Write why (at least 5 letters): it is written in the audit log.'; end if;
  if o.escrow_status is not null and o.escrow_status <> 'locked' then raise exception 'The escrow is already %', o.escrow_status; end if;
  before := jsonb_build_object('status', o.status, 'escrow_status', o.escrow_status);
  if p_action = 'release' then
    if o.status not in ('accepted', 'shipped', 'delivered', 'paid', 'disputed') then
      raise exception 'The farmer has not accepted this order yet — there is nothing to release.';
    end if;
    update public.market_orders
       set status = 'completed', delivered_at = coalesce(delivered_at, now()),
           escrow_status = 'released', escrow_released_at = now(),
           payment_confirmed_at = coalesce(payment_confirmed_at, now())
     where id = p_order returning * into o;
  elsif p_action = 'refund' then
    if o.status not in ('placed', 'accepted', 'shipped', 'delivered', 'paid', 'disputed') then
      raise exception 'This order is already %.', 'closed';
    end if;
    if o.status = 'accepted' and o.listing_id is not null then
      update public.market_listings set quantity = quantity + o.quantity where id = o.listing_id;
    end if;
    update public.market_orders
       set status = 'cancelled', escrow_status = 'refunded', escrow_released_at = now(),
           seller_note = coalesce(seller_note, 'Escrow refunded — ' || s)
     where id = p_order returning * into o;
  else
    raise exception 'Unknown escrow action';
  end if;
  perform public.kr_audit('escrow_' || p_action, 'market_orders:' || left(o.id::text, 8), before,
                          jsonb_build_object('status', o.status, 'escrow_status', o.escrow_status), s);
  return o;
end $$;
revoke all on function public.kr_admin_escrow(uuid, text, text) from public, anon;
grant execute on function public.kr_admin_escrow(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
