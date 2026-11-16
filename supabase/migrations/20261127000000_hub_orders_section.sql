-- The Hub is for KashRoot staff the Super Admin chose: "Orders" becomes a section that can be ticked for a team member,
-- and the orders (the order list, and the table itself) answer only a person who has it. Until now both answered ANY
-- admin, whatever was ticked for them: a team member with only "Help desk" could read every buyer's and farmer's phone,
-- address and payout details through the database. The Super Admin always passes (kr_team_can).
--
-- Also fixed here: the order list passed 122 arguments to one jsonb_build_object() call and Postgres allows 100, so it
-- failed with "cannot pass more than 100 arguments to a function" for everyone (Orders tab and Hub desk stayed empty).
-- It now builds the row from two calls joined with ||. Run after 20261124000000_admin_pickup_view.sql. Safe to run again.

alter table public.team_sections drop constraint if exists team_sections_section_check;
alter table public.team_sections add constraint team_sections_section_check
  check (section in ('approvals', 'accounts', 'problems', 'help', 'contributors', 'coldstores', 'registry', 'numbers', 'security', 'setup', 'businesses', 'team', 'settings', 'orders'));

create or replace function public.kr_admin_orders()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  -- The Super Admin, or a team member the Super Admin ticked "Orders" for (and who passed two-step and the admin code).
  if not public.kr_team_can('orders') then
    raise exception 'Only the Super Admin and team members with Orders ticked can see the platform orders.' using errcode = '42501';
  end if;
  with x as (
    select jsonb_build_object(
      'id', o.id,
      'created_at', o.created_at,
      'status', o.status,
      'product', o.product,
      'quantity', o.quantity,
      'unit', o.unit,
      'unit_price', o.unit_price,
      'amount', o.amount,
      'buyer_id', o.buyer_id,
      'buyer_name', o.buyer_name,
      'buyer_phone', o.buyer_phone,
      'buyer_note', o.buyer_note,
      'seller_note', o.seller_note,
      'delivery_address', o.delivery_address,
      'delivery_lat', o.delivery_lat,
      'delivery_lon', o.delivery_lon,
      'buyer_live_lat', o.buyer_live_lat,
      'buyer_live_lng', o.buyer_live_lng,
      'buyer_live_address', o.buyer_live_address,
      'buyer_gps_updated_at', o.buyer_gps_updated_at,
      'buyer_gps_accuracy', o.buyer_gps_accuracy,
      'seller_id', o.seller_id,
      'seller_name', o.seller_name,
      'seller_phone', o.seller_phone,
      'seller_district', o.seller_district,
      'seller_live_lat', o.seller_live_lat,
      'seller_live_lng', o.seller_live_lng,
      'seller_live_address', o.seller_live_address,
      'seller_gps_updated_at', o.seller_gps_updated_at,
      'seller_gps_accuracy', o.seller_gps_accuracy)
      || jsonb_build_object(
      'last_lat', o.last_lat,
      'last_lon', o.last_lon,
      'last_accuracy', o.last_accuracy,
      'last_at', o.last_at,
      'ship_vehicle', o.ship_vehicle,
      'driver_name', o.driver_name,
      'driver_phone', o.driver_phone,
      'shipped_at', o.shipped_at,
      'pay_first', o.pay_first,
      'payment_state', o.payment_state,
      'payment_ref', o.payment_ref,
      'escrow_status', o.escrow_status,
      'escrow_locked_at', o.escrow_locked_at,
      'escrow_released_at', o.escrow_released_at,
      'payment_shared', (o.pay_first is true),
      'grade', l.grade,
      'category', l.category,
      'box_capacity_kg', l.box_capacity_kg,
      'packing_layers', l.packing_layers,
      'apples_per_box', l.apples_per_box,
      'payee_name', p.account_name,
      'payee_upi_id', p.upi_id,
      'payee_account_number', p.account_number,
      'payee_ifsc', p.ifsc,
      'payee_bank_name', p.bank_name,
      'pickup_stage', o.pickup_stage,
      'assigned_hub_name', o.assigned_hub_name,
      'boxes_packed_at', o.boxes_packed_at,
      'pickup_vehicle_number', o.pickup_vehicle_number,
      'pickup_driver_name', o.pickup_driver_name,
      'pickup_driver_phone', o.pickup_driver_phone) as j, o.created_at as j_created
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

drop policy if exists "Admins see every order" on public.market_orders;
create policy "Admins see every order" on public.market_orders for select to authenticated
  using (public.kr_team_can('orders'));

notify pgrst, 'reload schema';
