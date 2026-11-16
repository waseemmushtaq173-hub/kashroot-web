-- KashRoot: tell farmers and buyers when their order moves, by email, through the email queue
-- (20261108000000_email_outbox.sql), so nobody has to keep the page open.
--   the farmer:  a buyer ordered (order_new); a KashRoot pickup vehicle is assigned to the order (order_farmer_update)
--   the buyer:   the farmer accepted or declined; the boxes reached the hub; the truck is on the road; delivered
--                (order_buyer_update)
-- Only the order's short code, and what moved ("2 box Apple", "At the KashRoot Hub"), are named: never a name, phone,
-- address or amount. Not every step sends: a load of ten orders must not cost forty emails (the whole site sends at most 450
-- a day), so the in-app lists (Farmer → Pickups & updates, Buyer → Pooled truck) carry every step and email carries the
-- ones a person acts on. An order must never fail because an email could not be queued: each trigger catches its own errors.
-- Run after 20261128000000_soil_lab_tests.sql. Safe to run again. (Its list of email kinds is skipped for rows already there: a later kind, such as the hub's, would break a re-run; the newest list, in 20261130000000_hub_order_alerts.sql, is the strict one.)

alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'help_new', 'help_ack', 'help_reply', 'help_resolved', 'payout_changed', 'password_changed', 'email_changed', 'phone_changed', 'new_signin', 'signin_locked', 'team_changed', 'trip_lost',
  'lab_booking_new', 'lab_booking_cancelled', 'lab_booking_update', 'lab_report_ready',
  'order_new', 'order_farmer_update', 'order_buyer_update')) not valid;

-- The order's short code: the first eight letters and digits of its id, in capitals.
create or replace function public.kr_order_code(p_id uuid) returns text
language sql immutable set search_path = public as $$ select upper(substr(replace(p_id::text, '-', ''), 1, 8)) $$;

create or replace function public.kr_email_on_order_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.seller_id is not null then
      insert into public.email_outbox (kind, user_id, ref, detail)
      values ('order_new', new.seller_id, public.kr_order_code(new.id), left(trim_scale(new.quantity)::text || ' ' || coalesce(new.unit, '') || ' ' || coalesce(new.product, ''), 80));
    end if;
  exception when others then
    null; -- never block an order because an email could not be queued
  end;
  return new;
end $$;
drop trigger if exists market_orders_email_new on public.market_orders;
create trigger market_orders_email_new after insert on public.market_orders for each row execute function public.kr_email_on_order_new();

create or replace function public.kr_email_on_order_moved() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  code text := public.kr_order_code(new.id);
  what text := left(trim_scale(new.quantity)::text || ' ' || coalesce(new.unit, '') || ' ' || coalesce(new.product, ''), 60);
begin
  begin
    -- the buyer: the farmer's answer
    if new.status is distinct from old.status and new.buyer_id is not null then
      if new.status = 'accepted' then
        insert into public.email_outbox (kind, user_id, ref, detail) values ('order_buyer_update', new.buyer_id, code, left('Accepted by the farmer: ' || what, 80));
      elsif new.status = 'rejected' then
        insert into public.email_outbox (kind, user_id, ref, detail) values ('order_buyer_update', new.buyer_id, code, left('Declined by the farmer: ' || what, 80));
      end if;
    end if;
    -- the pickup steps
    if new.pickup_stage is distinct from old.pickup_stage and new.pickup_stage is not null then
      if new.pickup_stage = 'PICKUP_VEHICLE_ASSIGNED' and new.seller_id is not null then
        insert into public.email_outbox (kind, user_id, ref, detail) values ('order_farmer_update', new.seller_id, code, left('A pickup vehicle is assigned: ' || what, 80));
      end if;
      if new.pickup_stage in ('CONSOLIDATED_AT_KASHROOT_HUB', 'IN_TRANSIT_TO_BUYER', 'DELIVERED') and new.buyer_id is not null then
        insert into public.email_outbox (kind, user_id, ref, detail)
        values ('order_buyer_update', new.buyer_id, code,
                left(case new.pickup_stage when 'CONSOLIDATED_AT_KASHROOT_HUB' then 'At the KashRoot Hub: ' when 'IN_TRANSIT_TO_BUYER' then 'On the road to you: ' else 'Delivered: ' end || what, 80));
      end if;
    end if;
  exception when others then
    null;
  end;
  return new;
end $$;
drop trigger if exists market_orders_email_moved on public.market_orders;
create trigger market_orders_email_moved after update of status, pickup_stage on public.market_orders for each row execute function public.kr_email_on_order_moved();

notify pgrst, 'reload schema';
