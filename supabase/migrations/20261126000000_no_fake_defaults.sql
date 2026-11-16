-- No invented data in the database itself.
--
-- Several tables carried DEFAULT values that were somebody's example, so a row saved without a value
-- silently became a made-up one:
--   gps_shipments  a trip with no route was "Shopian Fruit Mandi -> Singena Agrahara / Yeshwanthpur APMC,
--                  Bengaluru", 200 boxes of "Kashmir Kullu Delicious Apples", 3,600 kg, 2,840 km;
--                  and every trip's buyer PIN was "1234".
--   drivers        home district "Shopian", home state "Jammu & Kashmir"
--   vehicles       payload capacity 15,000 kg
--   cold_storage_bookings   village "Shopian", variety "Kullu Delicious", grade "Grade A", chamber "CH-01"
--   cold_storage_organizations   district "Shopian", state "Jammu & Kashmir"
-- After this file a row must say what it is: leaving a value out is an error, not a guess. KashRoot's own
-- routes already send every value (src/app/api/tracking/portal and the others were changed with this file).
--
-- Also: a tracking PIN of "1234" (the old default) is replaced by a random 6-digit one, so a trip that was
-- saved with the default can no longer be opened by anyone who knows the Tracking ID. The person who made the
-- trip sees the new PIN in the driver's Start-a-trip screen.
--
-- Run after 20261125000000_official_feeds.sql. Safe to run again.

do $$
begin
  if to_regclass('public.gps_shipments') is not null then
    alter table public.gps_shipments
      alter column commodity_name drop default,
      alter column box_count drop default,
      alter column total_weight_kg drop default,
      alter column origin_name drop default,
      alter column origin_lat drop default,
      alter column origin_lng drop default,
      alter column destination_name drop default,
      alter column destination_lat drop default,
      alter column destination_lng drop default,
      alter column total_route_distance_km drop default,
      alter column remaining_distance_km drop default,
      alter column buyer_access_pin drop default;

    -- A trip made with the old default PIN gets a random one (the owner of the trip reads it in the driver console).
    update public.gps_shipments
       set buyer_access_pin = lpad((floor(random() * 900000) + 100000)::int::text, 6, '0')
     where buyer_access_pin = '1234' or buyer_access_pin !~ '^[0-9]{6}$';
  end if;

  if to_regclass('public.drivers') is not null then
    alter table public.drivers
      alter column home_district drop default,
      alter column home_state drop default;
  end if;

  if to_regclass('public.vehicles') is not null then
    alter table public.vehicles alter column payload_capacity_kg drop default;
  end if;

  if to_regclass('public.cold_storage_bookings') is not null then
    alter table public.cold_storage_bookings
      alter column farmer_village_or_district drop default,
      alter column apple_variety drop default,
      alter column apple_grade drop default,
      alter column chamber_code drop default;
  end if;

  if to_regclass('public.cold_storage_organizations') is not null then
    alter table public.cold_storage_organizations
      alter column district drop default,
      alter column state_ut drop default;
  end if;
end $$;

notify pgrst, 'reload schema';
