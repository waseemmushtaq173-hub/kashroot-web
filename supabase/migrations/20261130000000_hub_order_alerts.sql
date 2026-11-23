-- KashRoot: tell the KashRoot hub when an order comes to it, by email, through the email queue
-- (20261108000000_email_outbox.sql). The hub's staff are the Super Admin and the team members the Super Admin ticked for
-- "Orders" (20261127000000_hub_orders_section.sql); they also see the same orders at once in Hub → Orders & pickups
-- ("Incoming for the hub": the orchard's location, how far it is from the hub, a route for the vehicle).
--   hub_order_new     a buyer placed an order (the hub learns what is coming and from which hub area)
--   hub_order_packed  the farmer packed the boxes: a pickup vehicle is needed now
-- Only the order's short code, what was ordered and the hub's name are written: never a name, phone, address or amount.
-- At most six people are emailed per order (the whole site sends at most 450 a day). An order must never fail because an
-- email could not be queued: each trigger catches its own errors.
-- Run after 20261129000000_order_notifications.sql. Safe to run again.

-- The email kinds (a later migration re-adds the list with its own kinds; this one skips rows already there, so a re-run still loads).
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'help_new', 'help_ack', 'help_reply', 'help_resolved', 'payout_changed', 'password_changed', 'email_changed', 'phone_changed', 'new_signin', 'signin_locked', 'team_changed', 'trip_lost',
  'lab_booking_new', 'lab_booking_cancelled', 'lab_booking_update', 'lab_report_ready',
  'order_new', 'order_farmer_update', 'order_buyer_update',
  'hub_order_new', 'hub_order_packed')) not valid;

-- Who works the hub: the Super Admin, and the team members ticked for Orders. Internal: nobody calls it from the app.
create or replace function public.kr_hub_staff() returns table (user_id uuid)
language sql stable security definer set search_path = public, auth as $$
  select x.id from (
    select t.user_id as id from public.team_sections t where t.section = 'orders'
    union
    select u.id from auth.users u, public.kr_settings s
     where s.id = 1 and s.super_admin_email is not null and lower(u.email) = lower(s.super_admin_email)
       and coalesce(u.raw_app_meta_data ->> 'kr_role', '') = 'super_admin'
  ) x
  limit 6
$$;
revoke all on function public.kr_hub_staff() from public, anon, authenticated;

create or replace function public.kr_email_on_hub_order_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  what text := left(trim_scale(new.quantity)::text || ' ' || coalesce(new.unit, '') || ' ' || coalesce(new.product, ''), 50);
begin
  begin
    if coalesce(new.pay_first, false) = false then
      insert into public.email_outbox (kind, user_id, ref, detail)
      select 'hub_order_new', s.user_id, public.kr_order_code(new.id), left(what || coalesce(' · ' || nullif(btrim(new.assigned_hub_name), ''), ''), 80)
        from public.kr_hub_staff() s;
    end if;
  exception when others then
    null; -- never block an order because an email could not be queued
  end;
  return new;
end $$;
drop trigger if exists market_orders_email_hub_new on public.market_orders;
create trigger market_orders_email_hub_new after insert on public.market_orders for each row execute function public.kr_email_on_hub_order_new();

create or replace function public.kr_email_on_hub_order_packed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  what text := left(trim_scale(new.quantity)::text || ' ' || coalesce(new.unit, '') || ' ' || coalesce(new.product, ''), 50);
begin
  begin
    if new.pickup_stage = 'AWAITING_HUB_VEHICLE' and new.pickup_stage is distinct from old.pickup_stage then
      insert into public.email_outbox (kind, user_id, ref, detail)
      select 'hub_order_packed', s.user_id, public.kr_order_code(new.id), left(what || coalesce(' · ' || nullif(btrim(new.assigned_hub_name), ''), ''), 80)
        from public.kr_hub_staff() s;
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;
drop trigger if exists market_orders_email_hub_packed on public.market_orders;
create trigger market_orders_email_hub_packed after update of pickup_stage on public.market_orders for each row execute function public.kr_email_on_hub_order_packed();

notify pgrst, 'reload schema';
