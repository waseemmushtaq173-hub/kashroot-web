-- Business consoles, stage 2 (20261116000000_business_listings.sql): a store goes into a business only
-- by the person who listed it and owns the business; then its team sees and handles its bookings (and
-- who did is kept), sees receipts, and farmers pay the business's details; nobody else gets in; the
-- team never edits the store or takes it; a paused business's team can do nothing and farmers pay the
-- lister as before. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'lister@store.in'),
  ('00000000-0000-0000-0000-0000000000c2', 'staff@store.in'),
  ('00000000-0000-0000-0000-0000000000c5', 'farmer@orchard.in'),
  ('00000000-0000-0000-0000-0000000000c9', 'other@business.in')
on conflict do nothing;
insert into public.organisations (id, name, kind, created_by) values
  ('00000000-0000-0000-0000-00000000aa01', 'Lolab Cold Store', 'cold_store', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-00000000aa09', 'Other Business', 'dealer', '00000000-0000-0000-0000-0000000000c9');
insert into public.org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000c1', 'owner'),
  ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000c2', 'staff'),
  ('00000000-0000-0000-0000-00000000aa09', '00000000-0000-0000-0000-0000000000c9', 'owner');
insert into public.payout_accounts (user_id, account_name, upi_id) values ('00000000-0000-0000-0000-0000000000c1', 'Lister', 'personal@okbank');
insert into public.org_payout_accounts (org_id, account_name, upi_id) values ('00000000-0000-0000-0000-00000000aa01', 'Lolab Cold Store', 'business@okbank');
insert into public.rental_listings (id, owner_id, kind, title, owner_name, phone, district, unit, capacity, available, rate, active)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'cold_store', 'Lolab Store', 'Lister', '9876543210', 'Kupwara', 'box_month', 100, 100, 40, true),
         ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'cold_store', 'Lolab Hidden', 'Lister', '9876543210', 'Kupwara', 'box_month', 100, 100, 40, false);
insert into public.rental_bookings (id, listing_id, owner_id, renter_id, renter_name, renter_phone, units, duration, start_date, status)
  values ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c5', 'Farmer', '9876500000', 10, 3, current_date, 'requested');
create temp table t (step text, ok boolean);
grant all on t to authenticated;

set local role authenticated;
-- Before the store is in the business: staff see and do nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
insert into t select 'staff see no bookings of a store outside the business', count(*) = 0 from public.rental_bookings;
do $$ begin
  perform public.kr_booking_action('00000000-0000-0000-0000-00000000bb01', 'confirm');
  insert into t values ('staff cannot confirm before', false);
exception when others then insert into t values ('staff cannot confirm before', true);
end $$;
-- Another business owner cannot take the store.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c9', true);
do $$ begin
  perform public.kr_org_attach_listing('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000aa09');
  insert into t values ('nobody takes another person''s store', false);
exception when others then insert into t values ('nobody takes another person''s store', true);
end $$;
-- The lister cannot put it in a business they do not own, nor give the listing away.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$ begin
  update public.rental_listings set org_id = '00000000-0000-0000-0000-00000000aa09' where id = '00000000-0000-0000-0000-0000000000d1';
  insert into t values ('only into a business they own', false);
exception when others then insert into t values ('only into a business they own', true);
end $$;
do $$ begin
  update public.rental_listings set owner_id = '00000000-0000-0000-0000-0000000000c9' where id = '00000000-0000-0000-0000-0000000000d1';
  insert into t values ('a listing stays with its lister', false);
exception when others then insert into t values ('a listing stays with its lister', true);
end $$;
-- The owner of both puts both stores in the business.
select public.kr_org_attach_listing('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000aa01');
select public.kr_org_attach_listing('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000aa01');
-- The farmer is now asked to pay the business, and a new booking cannot claim who handled it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', true);
insert into t select 'farmer pays the business', upi_id = 'business@okbank' from public.kr_payment_details('booking', '00000000-0000-0000-0000-00000000bb01');
insert into public.rental_bookings (id, listing_id, renter_name, renter_phone, units, duration, start_date, handled_by)
  values ('00000000-0000-0000-0000-00000000bb02', '00000000-0000-0000-0000-0000000000d1', 'Farmer', '9876500000', 10, 2, current_date, '00000000-0000-0000-0000-0000000000c2');
select public.kr_booking_action('00000000-0000-0000-0000-00000000bb01', 'pay', 'UTR123456789');
insert into t select 'the receipt keeps the business''s details', paid_to ->> 'upi' = 'business@okbank' from public.rental_bookings where id = '00000000-0000-0000-0000-00000000bb01';

-- Staff now see the business's stores (even the hidden one) and bookings, and confirm.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
insert into t select 'staff see the hidden store of the business', count(*) = 1 from public.rental_listings where id = '00000000-0000-0000-0000-0000000000d2';
insert into t select 'staff see its bookings', count(*) = 2 from public.rental_bookings;
insert into t select 'a farmer cannot say who handled', handled_by is null from public.rental_bookings where id = '00000000-0000-0000-0000-00000000bb02';
select public.kr_booking_action('00000000-0000-0000-0000-00000000bb01', 'confirm');
insert into t select 'staff confirm, and it says who', status = 'confirmed' and handled_by = '00000000-0000-0000-0000-0000000000c2' from public.rental_bookings where id = '00000000-0000-0000-0000-00000000bb01';
insert into t values ('staff see the receipt', public.kr_cold_receipt('00000000-0000-0000-0000-00000000bb01') ->> 'viewer' = 'owner');
-- Staff never change the store or take it out.
update public.rental_listings set rate = 1 where id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  perform public.kr_org_attach_listing('00000000-0000-0000-0000-0000000000d1', null);
  insert into t values ('staff cannot take the store out', false);
exception when others then insert into t values ('staff cannot take the store out', true);
end $$;
-- Someone outside sees nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c9', true);
insert into t select 'outsiders see no bookings', count(*) = 0 from public.rental_bookings;
insert into t values ('outsiders get no receipt', public.kr_cold_receipt('00000000-0000-0000-0000-00000000bb01') is null);
do $$ begin
  perform public.kr_booking_action('00000000-0000-0000-0000-00000000bb02', 'reject');
  insert into t values ('outsiders cannot decline', false);
exception when others then insert into t values ('outsiders cannot decline', true);
end $$;
reset role;
insert into t select 'the rate is unchanged', rate = 40 from public.rental_listings where id = '00000000-0000-0000-0000-0000000000d1';

-- KashRoot pauses the business: its team can do nothing; farmers pay the lister as before.
update public.organisations set suspended_at = now(), suspended_reason = 'test' where id = '00000000-0000-0000-0000-00000000aa01';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
insert into t select 'a paused business''s staff see nothing', count(*) = 0 from public.rental_bookings;
do $$ begin
  perform public.kr_booking_action('00000000-0000-0000-0000-00000000bb02', 'confirm');
  insert into t values ('a paused business''s staff cannot confirm', false);
exception when others then insert into t values ('a paused business''s staff cannot confirm', true);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', true);
insert into t select 'then the farmer pays the lister', upi_id = 'personal@okbank' from public.kr_payment_details('booking', '00000000-0000-0000-0000-00000000bb02');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select public.kr_booking_action('00000000-0000-0000-0000-00000000bb02', 'reject', null, 'Full');
insert into t select 'the lister still can', status = 'rejected' from public.rental_bookings where id = '00000000-0000-0000-0000-00000000bb02';
reset role;

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: business stores —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: a business''s team handles its stores'' bookings; nobody else; no one takes a store; a paused business does nothing'
\endif
