-- KashRoot: close what was left open.
--
-- A check of the live project (as a signed-out visitor, with the public key every browser has) found that three families of
-- tables were readable, and some writable, by anyone:
--   * the live tracking tables (drivers with their licence and PIN hash, vehicles, GPS devices, shipments, live pings, events),
--   * the cold-store tables (bookings with the farmer's name and phone, shared bins, the stock ledger, the owner's business
--     record with PAN and bank details, staff, the money ledger, the audit log),
--   * the payout account (UPI id, bank account number and IFSC) on a farmer's market listing and on a cold store's listing.
-- They had been given "open" policies (`for all using (true)`), on the idea that the server's own routes would be the only
-- door. The server routes now sign the caller in and decide what they may see (lib/server/callerAuth), so the tables are
-- closed to every browser key and opened only to the server's own key (the service role).
--
--   kr_close_table(table)       row security on, every always-true policy removed, nothing granted to anon / authenticated,
--                               everything to service_role. Used for the tables a browser never reads directly.
--   kr_limit_columns(table, hidden_from_anon, hidden_from_all)
--                               the columns a browser may read: the payout account of a market listing is read by nobody
--                               but the escrow (inside the database); a signed-out visitor never reads a phone number or a
--                               cold store's payout account. A browser asks for named columns, never `*`
--                               (src/lib/db/listingColumns.ts). Run again after a later column is added to the table.
--   shipment_tracking_trips.created_by   who made a trip: only they (and the team) can send its pings.
--   cold_storage_organizations.owner_user_id / owner_staff_members.user_id   tied to the account whose confirmed e-mail
--                               matches the one the business was registered with, so the next check is by account.
--
-- Needs SUPABASE_SERVICE_ROLE_KEY set on the server (Vercel) before this is run, or the cold-store, tracking and Business
-- admin screens cannot read their own tables. Run after 20261130000000_hub_order_alerts.sql. Safe to run again.

-- Tables only the server reads or writes.
create or replace function public.kr_close_table(p_table text) returns void
language plpgsql security definer set search_path = public as $$
declare
  p record;
begin
  if to_regclass(format('public.%I', p_table)) is null then return; end if;
  execute format('alter table public.%I enable row level security', p_table);
  for p in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = p_table
       and (qual is null or qual = 'true') and (with_check is null or with_check = 'true')
       and roles && array['public', 'anon', 'authenticated']::name[]
  loop
    execute format('drop policy %I on public.%I', p.policyname, p_table);
  end loop;
  execute format('revoke all on public.%I from anon, authenticated', p_table);
  execute format('grant select, insert, update, delete on public.%I to service_role', p_table);
end $$;
revoke all on function public.kr_close_table(text) from public, anon, authenticated;

select public.kr_close_table(t) from unnest(array[
  -- live tracking
  'drivers', 'vehicles', 'driver_vehicles', 'gps_devices', 'gps_shipments', 'shipment_vehicles', 'tracking_sessions',
  'gps_location_updates', 'tracking_events', 'shipment_tracking_trips', 'shipment_telemetry_events', 'authorized_fleet',
  'product_photo_verifications',
  -- cold store
  'cold_storage_floors', 'cold_storage_bins', 'cold_storage_bookings', 'shared_bin_allocations', 'apple_inventory_movements',
  'ca_chamber_environment_readings', 'cold_storage_notifications', 'cold_storage_unit_allocations', 'cold_chamber_temperature_logs',
  -- business admin
  'cold_storage_organizations', 'owner_staff_members', 'facility_financial_transactions', 'platform_audit_logs'
]) as t;

-- The price board: anyone reads the offers that are on it; only the server writes them.
select public.kr_close_table('universal_price_listings');
do $$
begin
  if to_regclass('public.universal_price_listings') is not null then
    grant select on public.universal_price_listings to anon, authenticated;
    drop policy if exists "Anyone reads active offers" on public.universal_price_listings;
    create policy "Anyone reads active offers" on public.universal_price_listings for select to anon, authenticated using (is_active = true);
  end if;
end $$;

-- Columns a browser may read.
create or replace function public.kr_limit_columns(p_table text, p_hidden_from_anon text[], p_hidden_from_all text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  anon_cols text;
  auth_cols text;
begin
  if to_regclass(format('public.%I', p_table)) is null then return; end if;
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into auth_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_table and c.column_name <> all (p_hidden_from_all);
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into anon_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_table and c.column_name <> all (p_hidden_from_all || p_hidden_from_anon);
  if auth_cols is null or anon_cols is null then raise exception 'No columns to grant on public.%', p_table; end if;
  execute format('revoke select on public.%I from anon, authenticated', p_table);
  execute format('grant select (%s) on public.%I to anon', anon_cols, p_table);
  execute format('grant select (%s) on public.%I to authenticated', auth_cols, p_table);
end $$;
revoke all on function public.kr_limit_columns(text, text[], text[]) from public, anon, authenticated;

select public.kr_limit_columns('market_listings', array['phone'], array['payout_upi', 'bank_account_name', 'bank_account_no', 'bank_ifsc']);
select public.kr_limit_columns('rental_listings', array['phone', 'manager_phone', 'owner_payout_upi', 'owner_bank_account_name', 'owner_bank_account_no', 'owner_bank_ifsc'], array[]::text[]);
select public.kr_limit_columns('mandi_rates', array['phone'], array[]::text[]);
select public.kr_limit_columns('cold_store_directory', array['phone'], array[]::text[]);

-- Who made a trip, and the account behind a business.
alter table if exists public.shipment_tracking_trips add column if not exists created_by uuid references auth.users (id) on delete set null;

do $$
begin
  if to_regclass('public.cold_storage_organizations') is not null then
    update public.cold_storage_organizations o
       set owner_user_id = u.id
      from auth.users u
     where o.owner_user_id is null and u.email_confirmed_at is not null and lower(u.email) = lower(o.owner_email);
  end if;
  if to_regclass('public.owner_staff_members') is not null then
    update public.owner_staff_members s
       set user_id = u.id
      from auth.users u
     where s.user_id is null and u.email_confirmed_at is not null and lower(u.email) = lower(s.email);
  end if;
end $$;

notify pgrst, 'reload schema';
