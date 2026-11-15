-- Hub pickup workflow: a KashRoot pickup vehicle collects the grower's packed
-- boxes from the orchard gate and takes them to the nearest verified hub; the
-- grower never drives the highway truck. The order carries the pickup stage,
-- the assigned hub and vehicle, and display-only settlement fields (the 1%
-- buyer fee and the hub-to-buyer freight); the escrow amount itself is
-- unchanged (produce only). The 6-digit orchard-gate handover code lives in
-- its own server-only table so the buyer, who reads their own order row,
-- never sees the grower's code. The driver side (claiming a pickup, verifying
-- the code at the gate, hub arrival, transit) is server-mediated through the
-- tracking API with the service role; no new function here answers a
-- stranger. Safe to run again.

alter table if exists public.market_orders
  add column if not exists buyer_fee_inr numeric(12,2),
  add column if not exists freight_inr numeric(12,2),
  add column if not exists farmer_fee_inr numeric(12,2) not null default 0,
  add column if not exists assigned_hub_id text,
  add column if not exists assigned_hub_name text,
  add column if not exists pickup_stage text check (pickup_stage in
    ('AWAITING_HUB_VEHICLE', 'PICKUP_VEHICLE_ASSIGNED', 'PICKED_UP_FROM_ORCHARD_GATE',
     'CONSOLIDATED_AT_KASHROOT_HUB', 'IN_TRANSIT_TO_BUYER', 'DELIVERED')),
  add column if not exists boxes_packed_at timestamptz,
  add column if not exists pickup_vehicle_number text,
  add column if not exists pickup_driver_name text,
  add column if not exists pickup_driver_phone text;

-- The orchard-gate handover code, apart from the order row: server routes
-- (service role) read it to verify the pickup driver; the grower reads it
-- back only through kr_order_mark_packed below. Nobody else can see it.
create table if not exists public.order_handover_codes (
  order_id uuid primary key references public.market_orders(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now()
);
alter table public.order_handover_codes enable row level security;
revoke all on public.order_handover_codes from anon, authenticated;
grant select, insert, update, delete on public.order_handover_codes to service_role;

-- The grower marks the boxes packed and ready at the orchard gate: records
-- the time, puts the order in the pickup queue, and mints (once) a random
-- 6-digit handover code — from gen_random_uuid(), a cryptographic source —
-- to read out to the KashRoot pickup driver. Only the order's own seller or
-- their business team may call it; calling again returns the same code.
create or replace function public.kr_order_mark_packed(p_order uuid)
returns text language plpgsql security definer set search_path = public as $$
declare o public.market_orders; c text;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not public.kr_order_team(o.seller_id, o.org_id) then raise exception 'Only the seller or their business team can do this'; end if;
  if o.status not in ('accepted', 'shipped') then raise exception 'Accept the order first — then mark the boxes packed'; end if;
  insert into public.order_handover_codes (order_id, code)
    values (p_order, lpad((((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint & 2147483647) % 900000) + 100000)::text, 6, '0'))
    on conflict (order_id) do nothing;
  select code into c from public.order_handover_codes where order_id = p_order;
  update public.market_orders
     set boxes_packed_at = coalesce(boxes_packed_at, now()),
         pickup_stage = coalesce(pickup_stage, 'AWAITING_HUB_VEHICLE')
   where id = p_order;
  return c;
end $$;
revoke all on function public.kr_order_mark_packed(uuid) from public, anon;
grant execute on function public.kr_order_mark_packed(uuid) to authenticated;

notify pgrst, 'reload schema';
