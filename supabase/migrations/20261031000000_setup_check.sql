-- KashRoot: Setup check — which parts of the database setup have been run.
-- One row per migration file: its step, the part of KashRoot it serves, the
-- file name, and "yes" or "NO". Each row looks for the newest thing that file
-- makes (a table, column, function or a function's new shape), so a file that
-- stopped half way shows "NO".
--   Admin portal → Setup check calls it; RUN_THIS_ONCE.sql ends with the same rows.
-- It only reads the database's own catalogue (names of tables, columns and
-- functions): no people, bookings or money. Admins only from the website.
-- Every new migration adds its row here (and to RUN_THIS_ONCE.sql).
-- Run after 20261030000000_cold_store_photos.sql. Safe to run again.

create or replace function public.kr_setup_has_column(p_table text, p_column text) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from pg_attribute
     where attrelid = to_regclass('public.' || p_table) and attname = p_column and attnum > 0 and not attisdropped
  )
$$;

-- A public function by name; with p_text, one whose result type or body mentions it.
create or replace function public.kr_setup_has_function(p_name text, p_text text default null) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = p_name
       and (p_text is null or pg_get_function_result(p.oid) ilike '%' || p_text || '%' or p.prosrc ilike '%' || p_text || '%')
  )
$$;
revoke all on function public.kr_setup_has_column(text, text) from public, anon, authenticated;
revoke all on function public.kr_setup_has_function(text, text) from public, anon, authenticated;

-- The rows themselves, for the SQL Editor (RUN_THIS_ONCE.sql) and for kr_setup_status.
create or replace function public.kr_setup_rows() returns table (step int, part text, file text, done text)
language sql stable security definer set search_path = public as $$
  select s.step, s.part, s.file, case when s.ok then 'yes' else 'NO' end
  from (values
    (1,  'TrueScan batches',            '20261010000000_fertilizer_batches.sql',         to_regclass('public.fertilizer_batches') is not null),
    (2,  'Core: portals, rentals, shop', '20261011000000_kashroot_core.sql',              public.kr_setup_has_function('kr_admin_stats')),
    (3,  'Mandi rates',                 '20261012000000_mandi_rates.sql',                to_regclass('public.mandi_rates') is not null),
    (4,  'Contributors and pay',        '20261013000000_contributors.sql',               public.kr_setup_has_function('kr_mark_paid')),
    (5,  'Trust and security (KYC)',    '20261014000000_trust_and_security.sql',         public.kr_setup_has_column('batch_reports', 'phone')),
    (6,  'Admin team',                  '20261015000000_admin_team.sql',                 public.kr_setup_has_function('kr_admin_team')),
    (7,  'Admin: accounts',             '20261016000000_admin_accounts.sql',             public.kr_setup_has_function('kr_admin_accounts')),
    (8,  'Security log',                '20261017000000_security_log.sql',               public.kr_setup_has_function('kr_log_admin_sign_in')),
    (9,  'Admin: last active',          '20261018000000_accounts_last_active.sql',       public.kr_setup_has_function('kr_admin_accounts', 'last_active_at')),
    (10, 'Cold store: map',             '20261020000000_cold_store_map.sql',             to_regclass('public.cold_slot_bookings') is not null),
    (11, 'Cold store: chamber size',    '20261021000000_cold_chamber_size.sql',          public.kr_setup_has_column('cold_chambers', 'size')),
    (12, 'Cold store: shared places',   '20261022000000_cold_shared_places.sql',         public.kr_setup_has_column('cold_slot_bookings', 'boxes')),
    (13, 'Cold store: directory',       '20261023000000_cold_store_directory.sql',       public.kr_setup_has_function('kr_directory_import')),
    (14, 'Cold store: suggestions',     '20261024000000_cold_store_suggestions.sql',     public.kr_setup_has_column('cold_store_directory', 'status')),
    (15, 'Cold store: owner wizard',    '20261025000000_cold_store_details.sql',         public.kr_setup_has_function('kr_save_cold_chambers') and public.kr_setup_has_column('cold_chambers', 'rate') and public.kr_setup_has_column('rental_listings', 'building')),
    (16, 'Cold store: pay and receipt', '20261025100000_cold_booking_pay.sql',           public.kr_setup_has_function('kr_cold_receipt')),
    (17, 'Shop orders',                 '20261026000000_shop_orders.sql',                public.kr_setup_has_function('kr_order_driver_ping')),
    (18, 'PAN and sign-in',             '20261027000000_pan_and_signin.sql',             public.kr_setup_has_function('kr_admin_accounts', 'pan_last4')),
    (19, 'Buyer shop: verified sellers', '20261028000000_buyer_shop_verified_sellers.sql', public.kr_setup_has_function('kr_verified_sellers', 'identity_checks')),
    (20, 'TrueScan official lists',     '20261029000000_official_registry.sql',          public.kr_setup_has_function('kr_registry_stats')),
    (21, 'Cold store: photos',          '20261030000000_cold_store_photos.sql',          public.kr_setup_has_function('kr_store_photos_ok')),
    (22, 'Setup check',                 '20261031000000_setup_check.sql',                public.kr_setup_has_function('kr_setup_status')),
    (23, 'Last good copy of sources',   '20261101000000_source_cache.sql',               public.kr_setup_has_function('kr_cache_get')),
    (24, 'Assistant answer bank',       '20261102000000_assistant_answers.sql',          public.kr_setup_has_function('kr_answer_match')),
    (25, 'Shared rate limits',          '20261103000000_rate_limits.sql',                public.kr_setup_has_function('kr_rate_hit')),
    (26, 'Admin code kept with bcrypt', '20261104000000_admin_code_bcrypt.sql',          public.kr_setup_has_function('kr_code_matches')),
    (27, 'Help & support desk',         '20261105000000_support_desk.sql',               public.kr_setup_has_function('kr_support_open'))
  ) as s(step, part, file, ok)
  order by s.step
$$;
revoke all on function public.kr_setup_rows() from public, anon, authenticated;

-- Admin portal → Setup check. Admins only (kr_has_role from 20261011000000_kashroot_core.sql).
create or replace function public.kr_setup_status() returns table (step int, part text, file text, done text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only KashRoot admins can see this'; end if;
  return query select * from public.kr_setup_rows();
end $$;
revoke all on function public.kr_setup_status() from public, anon;
grant execute on function public.kr_setup_status() to authenticated;

notify pgrst, 'reload schema';
