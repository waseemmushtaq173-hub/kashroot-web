-- KashRoot: remove the test (QA / probe) records that earlier checks left in the live database.
--
-- NOT a migration: run it by hand, once, in Supabase -> SQL Editor, and read the answers first.
--   Step 1 shows exactly what would go (nothing is changed).
--   Step 2 deletes it, inside a transaction. It ends with ROLLBACK: run it once to see the counts, then
--   change the last line to COMMIT and run it again to really delete.
-- It only matches records whose own text says they are tests (names such as "QA Prod Verify 202611131437",
-- "QA Stale Probe …", "QA GPS Probe …", "QA Owner …", and vehicles whose model ends in "(prod verify)",
-- "(stale probe)" or "(QA probe)"), and the trips, positions and events of those vehicles. It never touches the
-- audit log, accounts, orders, cold stores or anything that does not carry those marks. Real drivers and
-- vehicles are not matched.

-- ───────── Step 1: what would be removed ─────────
select 'drivers' as what, count(*) as rows from public.drivers
 where full_name ~* '^QA (Prod Verify|Stale Probe|GPS Probe)\M'
union all
select 'vehicles', count(*) from public.vehicles
 where make_and_model ~* '\((prod verify|stale probe|QA probe)\)\s*$' or owner_name ~* '^QA (Prod |Stale )?Owner\M'
union all
select 'trips (gps_shipments) of those vehicles', count(distinct sv.shipment_id) from public.shipment_vehicles sv
 where sv.vehicle_id in (select id from public.vehicles where make_and_model ~* '\((prod verify|stale probe|QA probe)\)\s*$' or owner_name ~* '^QA (Prod |Stale )?Owner\M')
union all
select 'trips whose names are the old made-up default (Shopian -> Bengaluru, 200 boxes, 3600 kg)', count(*) from public.gps_shipments
 where origin_name = 'Shopian Fruit Mandi, Jammu & Kashmir' and destination_name like 'Singena Agrahara%' and box_count = 200 and total_weight_kg = 3600;

-- The records themselves, so you can read them:
select 'driver' as kind, id, full_name as name, phone, created_at from public.drivers where full_name ~* '^QA (Prod Verify|Stale Probe|GPS Probe)\M'
union all
select 'vehicle', id, registration_number || ' · ' || make_and_model, owner_name, created_at from public.vehicles
 where make_and_model ~* '\((prod verify|stale probe|QA probe)\)\s*$' or owner_name ~* '^QA (Prod |Stale )?Owner\M'
order by 1, 5;

-- ───────── Step 2: remove them (a transaction: read the counts, then change ROLLBACK to COMMIT) ─────────
begin;

create temp table _qa_vehicles on commit drop as
  select id from public.vehicles
   where make_and_model ~* '\((prod verify|stale probe|QA probe)\)\s*$' or owner_name ~* '^QA (Prod |Stale )?Owner\M';
create temp table _qa_drivers on commit drop as
  select id from public.drivers where full_name ~* '^QA (Prod Verify|Stale Probe|GPS Probe)\M';
create temp table _qa_trips on commit drop as
  select distinct shipment_id as id from public.shipment_vehicles
   where vehicle_id in (select id from _qa_vehicles) or driver_id in (select id from _qa_drivers);

-- Trips and what hangs on them (positions, sessions, events, assignments go with the trip).
delete from public.gps_shipments where id in (select id from _qa_trips);
-- Devices paired to a test vehicle.
delete from public.gps_devices where vehicle_id in (select id from _qa_vehicles);
-- The vehicles and drivers (their links go with them).
delete from public.vehicles where id in (select id from _qa_vehicles);
delete from public.drivers where id in (select id from _qa_drivers);

-- What was removed:
select
  (select count(*) from _qa_trips)    as trips_removed,
  (select count(*) from _qa_vehicles) as vehicles_removed,
  (select count(*) from _qa_drivers)  as drivers_removed;

rollback;   -- change this word to COMMIT, and run Step 2 again, to delete for real
