-- Hub desk: the Super Admin's order list now also carries each order's pickup
-- stage, hub, pickup vehicle and driver and the time the boxes were packed, so
-- KashRoot can see every pooled pickup from the orchard gate to the buyer in
-- one place. The same function as before with those fields added; needs
-- 20261123000000_hub_pickup_workflow.sql first. Safe to run again.

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
      'payee_ifsc', p.ifsc, 'payee_bank_name', p.bank_name,
      'pickup_stage', o.pickup_stage, 'assigned_hub_name', o.assigned_hub_name, 'boxes_packed_at', o.boxes_packed_at,
      'pickup_vehicle_number', o.pickup_vehicle_number, 'pickup_driver_name', o.pickup_driver_name, 'pickup_driver_phone', o.pickup_driver_phone
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

notify pgrst, 'reload schema';
