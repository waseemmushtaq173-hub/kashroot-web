-- Sharing a bin needs the first farmer's yes (20261202000000_cold_share_consent.sql). Owner O has a store with one chamber of
-- 2 places of 100 crates each. Farmer A books 60 crates on 1A. Farmer B books 40 crates on the same 1A: that asks A, and until A
-- says yes B cannot pay and the owner cannot confirm. Outsider X can see, answer and learn nothing. A's no cancels B's booking
-- and gives the room back; A's yes lets B pay. No answer in 24 hours ends the request. A place with nobody else on it, as
-- before, is booked at once with no request. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@store.in'),
  ('00000000-0000-0000-0000-0000000000a2', 'farmer-a@orchard.in'),
  ('00000000-0000-0000-0000-0000000000a3', 'farmer-b@orchard.in'),
  ('00000000-0000-0000-0000-0000000000a4', 'outsider@orchard.in'),
  ('00000000-0000-0000-0000-0000000000a5', 'farmer-c@orchard.in')
on conflict do nothing;
update public.kr_settings set kyc_required = false where id = 1;
set session_replication_role = replica;
insert into public.rental_listings (id, owner_id, kind, title, owner_name, phone, district, unit, capacity, available, rate, active)
  values ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-0000000000a1', 'cold_store', 'Test Cold Store', 'Owner O', '9876543210', 'Shopian', 'box_month', 200, 200, 10, true);
insert into public.cold_chambers (id, listing_id, name, rows, cols, boxes_per_slot, storage)
  values ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000d101', 'Chamber 1', 1, 2, 100, 'crates');
set session_replication_role = origin;
create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;
\set ch '00000000-0000-0000-0000-00000000e101'
\set st '00000000-0000-0000-0000-00000000d101'

-- Farmer A books 60 crates on 1A: nobody else is there, so nobody is asked.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select public.kr_book_cold_places(:'st', array[:'ch' || ':1A:60'], current_date, 3, 'Farmer A', '9876500001') as a_booking \gset
insert into t select 'a place with nobody else on it is booked with no request', (select count(*) from public.kr_cold_share_status(array[:'a_booking']::uuid[]) where state = 'none') = 1;
insert into t select 'farmer A can pay at once', (public.kr_booking_action(:'a_booking', 'pay', 'UTRAAAA0001')).status = 'paid';
reset role;
update public.rental_bookings set status = 'confirmed' where id = :'a_booking';

-- Farmer B books the 40 crates left on 1A: A is asked.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
select public.kr_book_cold_places(:'st', array[:'ch' || ':1A:40'], current_date, 3, 'Bashir Ahmad', '9876500002') as b_booking \gset
insert into t select 'sharing 1A asks the farmer on it, once', (select count(*) from public.kr_cold_share_status(array[:'b_booking']::uuid[]) where state = 'asked' and waiting = 1) = 1;
do $$ begin
  perform public.kr_booking_action((select id from public.rental_bookings where renter_name = 'Bashir Ahmad'), 'pay', 'UTRBBBB0001');
  insert into t values ('B cannot pay while A has not said yes', false);
exception when others then insert into t values ('B cannot pay while A has not said yes', sqlerrm like '%not said yes yet%');
end $$;
-- B sees nothing of the requests table itself, nor who was asked.
do $$ begin
  perform 1 from public.cold_share_requests;
  insert into t values ('B cannot read the requests table', false);
exception when others then insert into t values ('B cannot read the requests table', true);
end $$;
insert into t select 'B cannot see A in the inbox', (select count(*) from public.kr_cold_share_inbox()) = 0;
reset role;

-- The owner cannot confirm B while A has not said yes.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ begin
  perform public.kr_booking_action((select id from public.rental_bookings where renter_name = 'Bashir Ahmad'), 'confirm');
  insert into t values ('the owner cannot confirm B while A has not said yes', false);
exception when others then insert into t values ('the owner cannot confirm B while A has not said yes', sqlerrm like '%not said yes%');
end $$;
insert into t select 'the owner sees that B is waiting', (select count(*) from public.kr_cold_share_status(array[:'b_booking']::uuid[]) where state = 'asked') = 1;
reset role;

-- The outsider sees and answers nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
insert into t select 'an outsider sees no requests', (select count(*) from public.kr_cold_share_inbox()) = 0;
insert into t select 'an outsider learns nothing of B''s booking', (select count(*) from public.kr_cold_share_status(array[:'b_booking']::uuid[])) = 0;
reset role;
select id as req from public.cold_share_requests where booking_id = :'b_booking' \gset
select set_config('t.req', :'req', false);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
do $$ begin
  perform public.kr_cold_share_decide(current_setting('t.req')::uuid, true);
  insert into t values ('an outsider cannot answer A''s request', false);
exception when others then insert into t values ('an outsider cannot answer A''s request', sqlerrm like '%not yours to answer%');
end $$;
do $$ begin
  perform public.kr_cold_share_decide(gen_random_uuid(), true);
  insert into t values ('an unknown request says the same as someone else''s', false);
exception when others then insert into t values ('an unknown request says the same as someone else''s', sqlerrm like '%not yours to answer%');
end $$;
reset role;
insert into t select 'nothing changed after the outsider''s tries', (select state from public.cold_share_requests where id = :'req') = 'asked';

-- A sees the request: the first name and how many, never B's phone or surname. A says yes.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
insert into t select 'A is asked: first name, 40 crates, Chamber 1 row 1 stack 1',
  (select count(*) from public.kr_cold_share_inbox() i where i.asker = 'Bashir' and i.boxes = 40 and i.state = 'asked' and i.place like 'Chamber 1%Row 1, stack 1') = 1;
insert into t select 'the inbox never carries a phone or a surname', (select count(*) from public.kr_cold_share_inbox() i where i::text like '%9876500002%' or i::text like '%Ahmad%') = 0;
insert into t select 'A says yes', public.kr_cold_share_decide(:'req', true) = 'allowed';
do $$ begin
  perform public.kr_cold_share_decide(current_setting('t.req')::uuid, false);
  insert into t values ('A cannot answer twice', false);
exception when others then insert into t values ('A cannot answer twice', sqlerrm like '%already answered%');
end $$;
reset role;

-- B can now pay, and the owner confirm.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
insert into t select 'after the yes B sees it allowed', (select count(*) from public.kr_cold_share_status(array[:'b_booking']::uuid[]) where state = 'allowed' and waiting = 0) = 1;
insert into t select 'after the yes B can pay', (public.kr_booking_action(:'b_booking', 'pay', 'UTRBBBB0002')).status = 'paid';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
insert into t select 'after the yes the owner can confirm B', (public.kr_booking_action(:'b_booking', 'confirm')).status = 'confirmed';
reset role;
insert into t select 'both emails were queued: the ask to A and the answer to B',
  (select count(*) from public.email_outbox where kind = 'cold_share_ask' and user_id = '00000000-0000-0000-0000-0000000000a2') = 1
  and (select count(*) from public.email_outbox where kind = 'cold_share_answer' and user_id = '00000000-0000-0000-0000-0000000000a3' and detail like 'Yes:%') = 1;
insert into t select 'the emails name no surname or phone', (select count(*) from public.email_outbox where kind like 'cold_share_%' and (detail like '%Ahmad%' or detail like '%98765%')) = 0;

-- Farmer C wants the other 1B (nobody there: no request) and then 1A is full for C.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', true);
do $$ begin
  perform public.kr_book_cold_places('00000000-0000-0000-0000-00000000d101', array['00000000-0000-0000-0000-00000000e101:1A:10'], current_date, 3, 'Farmer C', '9876500003');
  insert into t values ('a full place cannot be booked, asked or not', false);
exception when others then insert into t values ('a full place cannot be booked, asked or not', sqlerrm like '%taken%');
end $$;
-- C books 1B (empty) for 30 crates; D-like second farmer asks for 1B next: C is asked and says no.
select public.kr_book_cold_places(:'st', array[:'ch' || ':1B:30'], current_date, 2, 'Farmer C', '9876500003') as c_booking \gset
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
select public.kr_book_cold_places(:'st', array[:'ch' || ':1B:50'], current_date, 2, 'Outsider Khan', '9876500004') as x_booking \gset
insert into t select 'the new farmer''s booking waits for C', (select count(*) from public.kr_cold_share_status(array[:'x_booking']::uuid[]) where state = 'asked') = 1;
reset role;
select id as req2 from public.cold_share_requests where booking_id = :'x_booking' \gset
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', true);
insert into t select 'C says no', public.kr_cold_share_decide(:'req2', false) = 'declined';
reset role;
insert into t select 'a no cancels the new booking and the room goes back', (select status from public.rental_bookings where id = :'x_booking') = 'cancelled'
  and public.kr_cold_used(:'ch'::uuid, '1B', public.kr_cold_period(current_date, 2)) = 30;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
insert into t select 'the declined farmer is told no, and cannot pay', (select count(*) from public.kr_cold_share_status(array[:'x_booking']::uuid[]) where state = 'declined') = 1;
do $$ begin
  perform public.kr_booking_action((select id from public.rental_bookings where renter_name = 'Outsider Khan'), 'pay', 'UTRXXXX0001');
  insert into t values ('a declined booking cannot be paid', false);
exception when others then insert into t values ('a declined booking cannot be paid', true);
end $$;
reset role;

-- No answer in 24 hours: the request ends with the hold, and the holder can no longer answer it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
select public.kr_book_cold_places(:'st', array[:'ch' || ':1B:40'], current_date, 2, 'Outsider Khan', '9876500004') as y_booking \gset
reset role;
update public.rental_bookings set created_at = now() - interval '25 hours' where id = :'y_booking';
select id as req3 from public.cold_share_requests where booking_id = :'y_booking' \gset
select set_config('t.req3', :'req3', false);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a5', true);
insert into t select 'after 24 hours the request is gone from the inbox', (select count(*) from public.kr_cold_share_inbox() where state = 'asked') = 0;
do $$ begin
  perform public.kr_cold_share_decide(current_setting('t.req3')::uuid, true);
  insert into t values ('a request cannot be answered after the 24 hours', false);
exception when others then insert into t values ('a request cannot be answered after the 24 hours', sqlerrm like '%has ended%');
end $$;
reset role;

-- The table is closed to every browser key; the functions are not open to the signed-out.
insert into t select 'the table is closed to the browser roles',
  not has_table_privilege('anon', 'public.cold_share_requests', 'select') and not has_table_privilege('authenticated', 'public.cold_share_requests', 'select')
  and not has_table_privilege('authenticated', 'public.cold_share_requests', 'insert') and not has_table_privilege('authenticated', 'public.cold_share_requests', 'update');
insert into t select 'the state helper is not callable from the browser', not has_function_privilege('authenticated', 'public.kr_cold_share_state(uuid)', 'execute');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  perform * from public.kr_cold_share_inbox();
  insert into t values ('a signed-out visitor cannot use the inbox', false);
exception when others then insert into t values ('a signed-out visitor cannot use the inbox', true);
end $$;
reset role;

select count(*) filter (where not ok) > 0 as bad, coalesce(string_agg(step, '; ') filter (where not ok), '') as which from t \gset
\if :bad
\echo 'FAIL: cold share —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: sharing a bin asks the farmer on it; pay and confirm wait for the yes; a no gives the room back; 24 hours end it; outsiders and the signed-out learn nothing; the table is closed'
\endif
