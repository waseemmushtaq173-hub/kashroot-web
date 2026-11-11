-- supabase/migrations/20261111000003_marketplace_live_gps_and_escrow.sql
--
-- Marketplace round (2026-11-11), additive only (IF NOT EXISTS / CREATE OR
-- REPLACE with the existing behaviour plus the stamps that were missing):
--
--   market_listings: the farmer's payout account (listing modal, produce) —
--     where the escrow releases the order money.
--   market_orders: the moving shipment's own live GPS columns (written by
--     kr_order_location next to last_*), the settlement reference recorded
--     when the escrow releases, and the buyer's delivery-confirmation time.
--   kr_order_action / kr_shop_step: accepting an order stamps accepted_at —
--     both accept paths left it NULL, so the lifecycle ledger was incomplete
--     (real orders shipped with accepted_at NULL: order dc930e8b).
--   kr_order_release: stamps delivered_confirmed_at and escrow_tx_ref (the
--     buyer's real payment reference) when the escrow releases to the farmer.
--   kr_order_location: also writes shipment_live_* alongside last_*.
--   kr_admin_orders: exposes the new fields, and falls back to the listing's
--     payout columns when the seller has no payout_accounts row.
--
-- The escrow_status CHECK stays ('locked','released','refunded') — the UI maps
-- those to the plain words; the directive's UPPERCASE labels are display only.
--
-- Executed remotely one statement per call:
--   npx supabase db query --remote="$DATABASE_URL" -f <one statement> --yes
-- followed by NOTIFY pgrst, 'reload schema'; so PostgREST serves the columns.

-- 1. market_listings — the farmer's payout account.
ALTER TABLE public.market_listings
  ADD COLUMN IF NOT EXISTS payout_upi TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no TEXT,
  ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;

-- 2. market_orders — shipment live GPS + escrow settlement + delivery confirmation.
ALTER TABLE public.market_orders
  ADD COLUMN IF NOT EXISTS shipment_live_lat double precision,
  ADD COLUMN IF NOT EXISTS shipment_live_lng double precision,
  ADD COLUMN IF NOT EXISTS shipment_gps_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escrow_tx_ref TEXT,
  ADD COLUMN IF NOT EXISTS delivered_confirmed_at timestamptz;

-- 3. kr_order_action — accept stamps accepted_at (the one lifecycle hole).
CREATE OR REPLACE FUNCTION public.kr_order_action(p_order uuid, p_action text, p_ref text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS market_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- The true five-step ledger: the moment the farmer accepted the order.
    update public.market_orders set status = 'accepted', accepted_at = now(), seller_note = left(p_note, 300) where id = p_order returning * into o;
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
end $function$;

-- 4. kr_shop_step — the Kissan Tools accept stamps accepted_at too.
CREATE OR REPLACE FUNCTION public.kr_shop_step(o market_orders, p_action text, p_ref text, p_note text)
 RETURNS market_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- The true five-step ledger: the moment the seller accepted the order.
    update public.market_orders set status = 'accepted', accepted_at = now(), seller_note = coalesce(left(p_note, 300), seller_note) where basket = b;
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
end $function$;

-- 5. kr_order_release — the buyer's confirmation: delivered_confirmed_at and
--    the real settlement reference (their payment UTR) on the escrow ledger.
CREATE OR REPLACE FUNCTION public.kr_order_release(p_order uuid)
 RETURNS market_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         delivered_confirmed_at = now(),
         escrow_tx_ref = payment_ref,
         payment_confirmed_at = coalesce(payment_confirmed_at, now())
   where id = p_order returning * into o;
  return o;
end $function$;

-- 6. kr_order_location — the moving shipment also lands in shipment_live_*.
CREATE OR REPLACE FUNCTION public.kr_order_location(p_order uuid, p_lat double precision, p_lon double precision, p_accuracy real DEFAULT NULL::real)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o public.market_orders;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Bad location'; end if;
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.kr_order_team(o.seller_id, o.org_id) then raise exception 'Only the seller or their business team can do this'; end if;
  if o.status = 'accepted' or o.status = 'placed' then raise exception 'Share the location after the order is shipped'; end if;
  if o.status <> 'shipped' then raise exception 'This order is not on the way any more. Sharing the location has stopped.'; end if;
  if o.last_at is not null and o.last_at > now() - interval '10 seconds' then return o.last_at; end if;
  update public.market_orders
     set last_lat = p_lat, last_lon = p_lon, last_accuracy = p_accuracy, last_at = now(),
         shipment_live_lat = p_lat, shipment_live_lng = p_lon, shipment_gps_updated_at = now()
   where (o.basket is not null and basket = o.basket) or (o.basket is null and id = o.id);
  return now();
end $function$;

-- 7. kr_admin_orders — 100% of orders with the new fields; the listing's
--    payout columns back the payee when payout_accounts has no row yet.
CREATE OR REPLACE FUNCTION public.kr_admin_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'shipment_live_lat', o.shipment_live_lat, 'shipment_live_lng', o.shipment_live_lng, 'shipment_gps_updated_at', o.shipment_gps_updated_at,
      'ship_vehicle', o.ship_vehicle, 'driver_name', o.driver_name, 'driver_phone', o.driver_phone, 'shipped_at', o.shipped_at,
      'pay_first', o.pay_first, 'payment_state', o.payment_state, 'payment_ref', o.payment_ref,
      'escrow_status', o.escrow_status, 'escrow_locked_at', o.escrow_locked_at, 'escrow_released_at', o.escrow_released_at,
      'escrow_tx_ref', o.escrow_tx_ref, 'delivered_confirmed_at', o.delivered_confirmed_at,
      'payment_shared', (o.pay_first is true),
      'grade', l.grade, 'category', l.category,
      'box_capacity_kg', l.box_capacity_kg, 'packing_layers', l.packing_layers, 'apples_per_box', l.apples_per_box,
      'payee_name', coalesce(p.account_name, l.bank_account_name), 'payee_upi_id', coalesce(p.upi_id, l.payout_upi),
      'payee_account_number', coalesce(p.account_number, l.bank_account_no),
      'payee_ifsc', coalesce(p.ifsc, l.bank_ifsc), 'payee_bank_name', p.bank_name
    ) as j, o.created_at as j_created
      from public.market_orders o
      left join public.market_listings l on l.id = o.listing_id
      left join lateral public.kr_order_payee(o.org_id, o.seller_id) p on true
      limit 2000
  )
  select coalesce(jsonb_agg(x.j order by x.j_created desc), '[]'::jsonb) into v from x;
  return v;
end $function$;
