-- Kissan Tools shop: farm tools and inputs with up to three photos, and
-- pay-first orders with shipping and live delivery tracking.
--
--   * market_listings.photos: up to three photos (data URLs). The old single
--     photo column stays and always holds the first photo, so older pages and
--     older rows keep working.
--   * market_orders, pay_first (Kissan Tools only — Price Comparison and the
--     Buyer portal stay pay-after-delivery). One checkout to one seller is one
--     basket: each product line is a row with the same basket id, and every
--     step moves the whole basket:
--       placed → seller accepts (stock checked and reserved; needs the
--       seller's payout details) → buyer pays the seller directly by UPI or
--       bank and enters the reference (payment_state 'paid') → seller
--       confirms the money arrived ('received') → seller ships (vehicle or
--       courier, driver) and the vehicle's position comes from the seller's
--       phone or the driver's tracking link → buyer presses "I received it"
--       (completed). KashRoot never holds the money.
--   * market_order_drivers: the driver's tracking-link token per basket. No
--     direct access: only the functions below read or use it.
--   * market_listings.photo_at: when the photos last changed, so a list that
--     refreshes often fetches a photo again only when it is new.
--   * market_orders.seller_name / seller_phone / seller_district: who sells
--     it, copied when the order is made, so the buyer keeps the name and the
--     call button even if the product is hidden or removed later.
-- Safe to run again; no existing row changes.

-- ───────────────────────── listing photos ─────────────────────────
alter table public.market_listings add column if not exists photos text[];
alter table public.market_listings add column if not exists photo_at timestamptz;

create or replace function public.kr_photos_ok(p text[]) returns boolean
language sql immutable set search_path = public as $$
  select p is null or (
    cardinality(p) <= 3
    and not exists (select 1 from unnest(p) x where x is null or x not like 'data:image/%' or char_length(x) > 600000)
  )
$$;
alter table public.market_listings drop constraint if exists market_listings_photos_check;
alter table public.market_listings add constraint market_listings_photos_check check (public.kr_photos_ok(photos));

-- photo is always the first of photos. A page that only knows the single
-- photo still works: what it sets becomes the first photo. photo_at moves
-- only when the photos change (not with the price or the stock).
create or replace function public.kr_listing_photos() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(cardinality(new.photos), 0) > 0 then new.photo := new.photos[1];
    elsif new.photo is not null then new.photos := array[new.photo];
    else new.photos := null;
    end if;
    new.photo_at := case when new.photo is not null then now() end;
    return new;
  end if;
  if new.photos is distinct from old.photos then
    new.photo := case when coalesce(cardinality(new.photos), 0) > 0 then new.photos[1] end;
    if coalesce(cardinality(new.photos), 0) = 0 then new.photos := null; end if;
  elsif new.photo is distinct from old.photo then
    new.photos := case when new.photo is null then null else array[new.photo] || coalesce(old.photos[2:3], '{}') end;
  end if;
  new.photo_at := case when new.photo is distinct from old.photo or new.photos is distinct from old.photos then now() else old.photo_at end;
  return new;
end $$;
drop trigger if exists market_listings_photos on public.market_listings;
create trigger market_listings_photos before insert or update on public.market_listings for each row execute function public.kr_listing_photos();

-- ───────────────────────── pay-first orders ─────────────────────────
alter table public.market_orders add column if not exists pay_first boolean not null default false;
alter table public.market_orders add column if not exists basket uuid;
alter table public.market_orders add column if not exists payment_state text;
alter table public.market_orders add column if not exists paid_at timestamptz;
alter table public.market_orders add column if not exists payment_confirmed_at timestamptz;
alter table public.market_orders add column if not exists delivery_lat double precision;
alter table public.market_orders add column if not exists delivery_lon double precision;
alter table public.market_orders add column if not exists ship_vehicle text;
alter table public.market_orders add column if not exists driver_name text;
alter table public.market_orders add column if not exists driver_phone text;
alter table public.market_orders add column if not exists shipped_at timestamptz;
alter table public.market_orders add column if not exists last_lat double precision;
alter table public.market_orders add column if not exists last_lon double precision;
alter table public.market_orders add column if not exists last_accuracy real;
alter table public.market_orders add column if not exists last_at timestamptz;
alter table public.market_orders add column if not exists delivered_at timestamptz;
alter table public.market_orders add column if not exists seller_name text;
alter table public.market_orders add column if not exists seller_phone text;
alter table public.market_orders add column if not exists seller_district text;

alter table public.market_orders drop constraint if exists market_orders_payment_state_check;
alter table public.market_orders add constraint market_orders_payment_state_check check (payment_state is null or payment_state in ('unpaid', 'paid', 'received'));
alter table public.market_orders drop constraint if exists market_orders_delivery_point_check;
alter table public.market_orders add constraint market_orders_delivery_point_check
  check ((delivery_lat is null and delivery_lon is null) or (delivery_lat between -90 and 90 and delivery_lon between -180 and 180));
alter table public.market_orders drop constraint if exists market_orders_last_point_check;
alter table public.market_orders add constraint market_orders_last_point_check
  check ((last_lat is null and last_lon is null) or (last_lat between -90 and 90 and last_lon between -180 and 180));
alter table public.market_orders drop constraint if exists market_orders_ship_vehicle_check;
alter table public.market_orders add constraint market_orders_ship_vehicle_check check (ship_vehicle is null or char_length(ship_vehicle) between 2 and 40);
alter table public.market_orders drop constraint if exists market_orders_driver_name_check;
alter table public.market_orders add constraint market_orders_driver_name_check check (driver_name is null or char_length(driver_name) <= 80);
alter table public.market_orders drop constraint if exists market_orders_driver_phone_check;
alter table public.market_orders add constraint market_orders_driver_phone_check check (driver_phone is null or driver_phone ~ '^[6-9][0-9]{9}$');
create index if not exists market_orders_basket on public.market_orders (basket) where basket is not null;

-- The driver's tracking link: one per basket (or per order without a basket).
create table if not exists public.market_order_drivers (
  basket     uuid primary key,
  token      text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);
alter table public.market_order_drivers enable row level security;
revoke all on public.market_order_drivers from anon, authenticated;

-- New orders: the price, seller and product come from the listing (and the
-- seller's name, mobile and district are kept on the order). Pay first is
-- only for farm tools and inputs, and a basket holds one buyer's products
-- from one seller. Nothing about payment or shipping can be set by the buyer.
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
  return new;
end $$;

-- Puts a basket's reserved stock back: an accepted order that is cancelled,
-- or stopped by "Report a problem" before it was shipped (the goods are
-- still with the seller).
create or replace function public.kr_shop_restock(p_basket uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.market_orders;
begin
  for r in select * from public.market_orders where basket = p_basket loop
    update public.market_listings set quantity = quantity + r.quantity where id = r.listing_id;
  end loop;
end $$;

-- One step of a pay-first order; the whole basket moves together. Called
-- from kr_order_action after it has checked who is asking.
create or replace function public.kr_shop_step(o public.market_orders, p_action text, p_ref text, p_note text)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare r public.market_orders; l public.market_listings; b uuid := o.basket;
begin
  perform 1 from public.market_orders where basket = b for update;
  if p_action = 'accept' then
    if o.status <> 'placed' then raise exception 'This order is already %', o.status; end if;
    if not exists (select 1 from public.payout_accounts where user_id = o.seller_id) then
      raise exception 'Add where buyers pay you first (UPI ID or bank account). Then accept the order.';
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

-- Pay after delivery (Price Comparison, Buyer portal), unchanged: seller
-- accept → ship; buyer confirms delivery → pays the seller directly and
-- enters the reference → seller confirms. Pay-first orders go to kr_shop_step.
create or replace function public.kr_order_action(p_order uuid, p_action text, p_ref text default null, p_note text default null)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders; l public.market_listings;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if p_action in ('accept', 'reject', 'ship', 'confirm_payment', 'not_received', 'seller_cancel', 'seller_dispute') then
    if o.seller_id is distinct from auth.uid() then raise exception 'Only the seller can do this'; end if;
  elsif p_action in ('cancel', 'delivered', 'pay', 'dispute') then
    if o.buyer_id is distinct from auth.uid() then raise exception 'Only the buyer can do this'; end if;
  else
    raise exception 'Unknown action';
  end if;
  if o.pay_first and o.basket is not null then return public.kr_shop_step(o, p_action, p_ref, p_note); end if;
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
  return o;
end $$;

-- The seller ships: vehicle number or courier, and the driver (optional).
-- A pay-first order ships only after the seller confirmed the money arrived.
-- Called again on a shipped order, it corrects the details.
create or replace function public.kr_order_ship(p_order uuid, p_vehicle text, p_driver_name text default null, p_driver_phone text default null, p_note text default null)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders; v text := btrim(coalesce(p_vehicle, '')); ph text := regexp_replace(coalesce(p_driver_phone, ''), '\D', '', 'g');
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.seller_id is distinct from auth.uid() then raise exception 'Only the seller can do this'; end if;
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
         seller_note = coalesce(left(nullif(btrim(p_note), ''), 300), seller_note)
   where (o.basket is not null and basket = o.basket) or (o.basket is null and id = o.id);
  select * into o from public.market_orders where id = p_order;
  return o;
end $$;

-- Where the vehicle is now, from the seller's phone. At most one update every 10 seconds.
create or replace function public.kr_order_location(p_order uuid, p_lat double precision, p_lon double precision, p_accuracy real default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare o public.market_orders;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Bad location'; end if;
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.seller_id is distinct from auth.uid() then raise exception 'Only the seller can do this'; end if;
  if o.status = 'accepted' or o.status = 'placed' then raise exception 'Share the location after the order is shipped'; end if;
  if o.status <> 'shipped' then raise exception 'This order is not on the way any more. Sharing the location has stopped.'; end if;
  if o.last_at is not null and o.last_at > now() - interval '10 seconds' then return o.last_at; end if;
  update public.market_orders set last_lat = p_lat, last_lon = p_lon, last_accuracy = p_accuracy, last_at = now()
   where (o.basket is not null and basket = o.basket) or (o.basket is null and id = o.id);
  return now();
end $$;

-- The seller's link for the driver (makes one the first time).
create or replace function public.kr_order_driver_link(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o public.market_orders; k uuid; t text;
begin
  select * into o from public.market_orders where id = p_order;
  if not found then raise exception 'Order not found'; end if;
  if o.seller_id is distinct from auth.uid() then raise exception 'Only the seller can do this'; end if;
  if o.status not in ('accepted', 'shipped') or (o.pay_first and o.status = 'accepted' and o.payment_state is distinct from 'received') then
    raise exception 'Make the driver link when the order is ready to ship';
  end if;
  k := coalesce(o.basket, o.id);
  insert into public.market_order_drivers (basket) values (k) on conflict (basket) do nothing;
  select token into t from public.market_order_drivers where basket = k;
  return t;
end $$;

-- The driver's page (no sign-in; the token is the key): what to deliver and where.
create or replace function public.kr_order_driver_view(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', o.status, 'delivery_address', o.delivery_address, 'delivery_lat', o.delivery_lat, 'delivery_lon', o.delivery_lon,
    'buyer_name', o.buyer_name, 'buyer_phone', o.buyer_phone, 'ship_vehicle', o.ship_vehicle, 'last_at', o.last_at,
    'items', (select jsonb_agg(jsonb_build_object('product', x.product, 'quantity', x.quantity, 'unit', x.unit) order by x.created_at)
                from public.market_orders x where x.basket = d.basket or x.id = d.basket))
  from public.market_order_drivers d
  join lateral (select * from public.market_orders m where m.basket = d.basket or m.id = d.basket order by m.created_at limit 1) o on true
  where p_token is not null and char_length(p_token) >= 32 and d.token = p_token
$$;

-- The driver's phone sends its position (only while the order is on the way).
create or replace function public.kr_order_driver_ping(p_token text, p_lat double precision, p_lon double precision, p_accuracy real default null)
returns text language plpgsql security definer set search_path = public as $$
declare k uuid; o public.market_orders;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Bad location'; end if;
  select basket into k from public.market_order_drivers where p_token is not null and char_length(p_token) >= 32 and token = p_token;
  if k is null then raise exception 'This driver link is not valid. Ask the seller for a new one.'; end if;
  select * into o from public.market_orders where basket = k or id = k order by created_at limit 1 for update;
  if not found then raise exception 'This driver link is not valid. Ask the seller for a new one.'; end if;
  if o.status <> 'shipped' then return o.status; end if;
  if o.last_at is not null and o.last_at > now() - interval '10 seconds' then return o.status; end if;
  update public.market_orders set last_lat = p_lat, last_lon = p_lon, last_accuracy = p_accuracy, last_at = now()
   where basket = k or id = k;
  return 'shipped';
end $$;

-- ───────────────────────── grants ─────────────────────────
revoke execute on function public.kr_shop_step(public.market_orders, text, text, text) from public, anon, authenticated;
revoke execute on function public.kr_shop_restock(uuid) from public, anon, authenticated;
revoke execute on function public.kr_order_action(uuid, text, text, text) from public, anon;
revoke execute on function public.kr_order_ship(uuid, text, text, text, text) from public, anon;
revoke execute on function public.kr_order_location(uuid, double precision, double precision, real) from public, anon;
revoke execute on function public.kr_order_driver_link(uuid) from public, anon;
grant execute on function public.kr_order_action(uuid, text, text, text), public.kr_order_ship(uuid, text, text, text, text),
  public.kr_order_location(uuid, double precision, double precision, real), public.kr_order_driver_link(uuid) to authenticated;
grant execute on function public.kr_order_driver_view(text), public.kr_order_driver_ping(text, double precision, double precision, real) to anon, authenticated;
