-- IDOR on the sensitive tables, seeded by hand: farmer F owns a store, a payout account, an
-- advisory request with messages and call signals, a hidden listing; buyer B has a booking on F's
-- store with booked places. Outsider O (signed in) and anon try to see, change, remove; the real
-- functions are tried as O (refused) and as B (allowed only what is B's). Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'farmer@test.in', '{"full_name":"Farmer"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'buyer@test.in', '{"full_name":"Buyer"}'),
  ('00000000-0000-0000-0000-0000000000c3', 'other@test.in', '{"full_name":"Outsider"}')
on conflict do nothing;

set session_replication_role = replica;
insert into public.payout_accounts (user_id, account_name, upi_id, account_number, ifsc, bank_name)
  values ('00000000-0000-0000-0000-0000000000f1', 'Farmer F', 'farmerf@okaxis', '123456789012', 'SBIN0001234', 'SBI');
insert into public.advisory_requests (id, farmer_id, farmer_name, farmer_phone, kind, message)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'Farmer F', '9876543210', 'question', 'Scab on my apples');
insert into public.advisory_messages (id, request_id, sender_id, sender_role, sender_name, body) overriding system value
  values (1, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'farmer', 'Farmer F', 'Photo attached');
insert into public.call_signals (id, request_id, sender_id, kind, payload) overriding system value
  values (1, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'offer', '{"sdp":"x"}');
insert into public.rental_listings (id, owner_id, kind, title, owner_name, phone, district, unit, capacity, available, rate, active)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000f1', 'cold_store', 'F Cold Store', 'Farmer F', '9876543210', 'Shopian', 'box_month', 100, 100, 40, true),
         ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000f1', 'cold_store', 'F Hidden Store', 'Farmer F', '9876543210', 'Shopian', 'box_month', 100, 100, 40, false);
insert into public.cold_chambers (id, listing_id, name, rows, cols, boxes_per_slot)
  values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'Chamber 1', 2, 2, 10);
insert into public.rental_bookings (id, listing_id, owner_id, renter_id, renter_name, renter_phone, units, duration, start_date, status)
  values ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2', 'Buyer B', '9876500000', 10, 3, current_date, 'paid');
insert into public.cold_slot_bookings (booking_id, chamber_id, slot, boxes) values ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000e1', '1A', 10);
insert into public.market_listings (seller_id, seller_name, phone, district, category, product, unit, price, quantity, active)
  values ('00000000-0000-0000-0000-0000000000f1', 'Farmer F', '9876543210', 'Shopian', 'produce', 'Hidden apples', 'box', 900, 10, false);
insert into public.role_requests (user_id, role, full_name, phone) values ('00000000-0000-0000-0000-0000000000f1', 'EXPERT', 'Farmer F', '9876543210');
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000f1', 'DEALER');
insert into public.contributions (id, user_id, kind, ref_id, title) overriding system value values (1, '00000000-0000-0000-0000-0000000000f1', 'answer', gen_random_uuid(), 'Answer about scab');
insert into public.mandi_rates (posted_by, reporter_name, phone, state, district, mandi, commodity, unit, min_price, modal_price, max_price, status)
  values ('00000000-0000-0000-0000-0000000000f1', 'Farmer F', '9876543210', 'Jammu and Kashmir', 'Shopian', 'Shopian Mandi', 'Apple', 'box', 800, 900, 1000, 'pending');
set session_replication_role = origin;

create temp table r (tbl text, who text, seen int, changed int, removed int);
grant all on r to anon, authenticated;
do $$
declare
  t text;
  who text;
  seen int; changed int; removed int;
  col text;
begin
  foreach t in array array['payout_accounts', 'advisory_requests', 'advisory_messages', 'call_signals', 'rental_bookings', 'cold_slot_bookings', 'market_listings', 'role_requests', 'staff_roles', 'contributions', 'mandi_rates', 'rental_listings', 'cold_chambers'] loop
    foreach who in array array['anon', 'outsider'] loop
      perform set_config('request.jwt.claim.sub', case when who = 'anon' then '' else '00000000-0000-0000-0000-0000000000c3' end, true);
      execute 'set local role ' || case when who = 'anon' then 'anon' else 'authenticated' end;
      select a.attname into col from pg_attribute a where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped and a.attidentity = '' order by a.attnum desc limit 1;
      begin execute format('select count(*) from public.%I', t) into seen; exception when others then seen := -1; end;
      begin execute format('with u as (update public.%I set %I = %I returning 1) select count(*) from u', t, col, col) into changed; exception when others then changed := -1; end;
      begin execute format('with d as (delete from public.%I returning 1) select count(*) from d', t) into removed; exception when others then removed := -1; end;
      reset role;
      insert into r values (t, who, seen, changed, removed);
    end loop;
  end loop;
end $$;
\echo '--- outsiders on the sensitive tables (expected: only the active store and its chamber are seen; nothing changed or removed) ---'
select * from r order by tbl, who;

\echo '--- the real functions, as the outsider O (all must refuse or return nothing) ---'
create temp table f (call text, outcome text);
grant all on f to authenticated;
do $$
declare
  res text;
  c text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
  foreach c in array array[
    'select public.kr_payment_details(''booking'', ''00000000-0000-0000-0000-00000000bb01'')::text',
    'select public.kr_booking_action(''00000000-0000-0000-0000-00000000bb01'', ''confirm'', null, null)::text',
    'select public.kr_booking_action(''00000000-0000-0000-0000-00000000bb01'', ''cancel'', null, null)::text',
    'select public.kr_cold_receipt(''00000000-0000-0000-0000-00000000bb01'')::text',
    'select public.kr_advisory_set(''00000000-0000-0000-0000-0000000000a1'', ''accept'', ''O'')::text',
    'select public.kr_can_see_request(''00000000-0000-0000-0000-0000000000a1'')::text',
    'select public.kr_save_cold_chambers(''00000000-0000-0000-0000-0000000000d1'', ''[]''::jsonb)::text'
  ] loop
    begin
      set local role authenticated;
      execute c into res;
      reset role;
      insert into f values (c, 'ANSWERED: ' || coalesce(res, 'null'));
    exception when others then
      reset role;
      insert into f values (c, 'refused: ' || left(sqlerrm, 70));
    end;
  end loop;
  -- The buyer B: their own booking's payment details (allowed), and the receipt.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  foreach c in array array[
    'select public.kr_payment_details(''booking'', ''00000000-0000-0000-0000-00000000bb01'')::text',
    'select public.kr_booking_action(''00000000-0000-0000-0000-00000000bb01'', ''confirm'', null, null)::text'
  ] loop
    begin
      set local role authenticated;
      execute c into res;
      reset role;
      insert into f values ('as B: ' || c, 'ANSWERED: ' || left(coalesce(res, 'null'), 120));
    exception when others then
      reset role;
      insert into f values ('as B: ' || c, 'refused: ' || left(sqlerrm, 70));
    end;
  end loop;
end $$;
select regexp_replace(call, 'select public\.([a-z_]+)\((.{0,40}).*', '\1(\2…)') as call, outcome from f;

-- PASS / FAIL.
do $$
declare bad text;
begin
  select string_agg(tbl || ' (' || who || ')', ', ') into bad from r
   where changed > 0 or removed > 0
      or (seen > 0 and not (tbl in ('rental_listings', 'cold_chambers', 'mandi_rates') and seen = 1));
  if bad is not null then raise exception 'FAIL: an outsider reached private rows in: %', bad; end if;
  select string_agg(call, ' | ') into bad from f
   where (call not like 'as B:%' and outcome like 'ANSWERED%' and outcome not in ('ANSWERED: null', 'ANSWERED: false'))
      or (call like 'as B: select public.kr_payment_details%' and outcome not like 'ANSWERED: ("Farmer F",farmerf@okaxis%')
      or (call like 'as B: select public.kr_booking_action%' and outcome like 'ANSWERED%');
  if bad is not null then raise exception 'FAIL: wrong answer from: %', bad; end if;
  raise notice 'PASS: payouts, chats, calls, bookings, places, roles and payments stay with their owners';
end $$;
