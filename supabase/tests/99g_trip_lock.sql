-- A driver's trip that cannot be stopped quietly (20261120000000_trip_lock.sql): the driver agrees and
-- starts; only the receiver's code ends it from the driver's side (5 wrong codes lock it); the code is
-- never shown to the driver, the public or another account; no position for 5 minutes marks the trip
-- lost, writes it in the events and queues one email to the sender; the next position clears it. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'sender@orchard.in'),
  ('00000000-0000-0000-0000-0000000000a8', 'other@example.in')
on conflict do nothing;
create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;

-- The sender creates a load (with the places' points).
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a7', true);
insert into public.consignments (origin, destination, origin_lat, origin_lng, dest_lat, dest_lng, driver_name)
values ('Shopian', 'Azadpur, Delhi', 33.72, 74.83, 28.71, 77.18, 'Test driver');
insert into t select 'the sender sees a 6-digit delivery code', delivery_code ~ '^[0-9]{6}$' from public.consignments;
reset role;
select code as kcode, driver_token as tok, delivery_code as dcode from public.consignments where owner_id = '00000000-0000-0000-0000-0000000000a7' \gset

-- Another account sees nothing of it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a8', true);
insert into t select 'another account cannot read the load or its code', count(*) = 0 from public.consignments;
reset role;

-- The public and the driver never get the code.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
insert into t select 'tracking by code never shows the delivery code', not (public.kr_track(:'kcode') ? 'delivery_code') and (public.kr_track(:'kcode') ->> 'dest_lat') is not null;
insert into t select 'the driver page never shows the delivery code', not (public.kr_driver_view(:'tok') ? 'delivery_code');
-- Starting needs the driver's consent.
do $$ begin
  perform public.kr_driver_start((select driver_token from public.consignments limit 1), false);
  insert into t values ('starting without consent is refused', false);
exception when others then insert into t values ('starting without consent is refused', true);
end $$;
insert into t select 'the driver starts the trip', public.kr_driver_start(:'tok', true) = 'in_transit';
insert into t select 'the old "end without a code" is gone', not exists (select 1 from pg_proc where proname = 'kr_driver_delivered' and pronargs = 1);
-- Wrong codes: refused, counted, then locked.
insert into t select 'a wrong code does not end the trip', (public.kr_driver_delivered(:'tok', '000000') ->> 'ok')::boolean = false
  or :'dcode' = '000000';
reset role;
insert into t select 'still on the way after a wrong code', status = 'in_transit' from public.consignments where code = :'kcode';
insert into t select 'the driver page can report GPS off', public.kr_driver_signal(:'tok', 'gps_off');
insert into t select 'a signal is written in the events', exists (select 1 from public.consignment_events where code = :'kcode' and kind = 'gps_off');
insert into t select 'the same signal within a minute is written once', public.kr_driver_signal(:'tok', 'gps_off') = false;

-- No position for 5 minutes: lost, written, and one email to the sender.
update public.consignments set trip_started_at = now() - interval '20 minutes', last_seen = now() - interval '10 minutes' where code = :'kcode';
insert into t select 'the watch finds the lost trip', public.kr_trip_watch_now() = 1;
insert into t select 'the trip is marked lost', lost_at is not null from public.consignments where code = :'kcode';
insert into t select 'tracking by code says lost', (public.kr_track(:'kcode') ->> 'lost')::boolean;
insert into t select 'one email is queued to the sender', count(*) = 1 from public.email_outbox where kind = 'trip_lost' and ref = :'kcode' and user_id = '00000000-0000-0000-0000-0000000000a7';
insert into t select 'a second watch finds nothing new', public.kr_trip_watch_now() = 0;
insert into t select 'and queues no second email', (select count(*) from public.email_outbox where kind = 'trip_lost' and ref = :'kcode') = 1;
do $$ begin
  perform public.kr_trip_watch('wrong-secret');
  insert into t values ('the watch refuses without the server secret', false);
exception when others then insert into t values ('the watch refuses without the server secret', true);
end $$;
-- The next position clears it.
update public.consignments set last_seen = now() - interval '1 minute' where code = :'kcode';
select public.kr_driver_ping(:'tok', 33.70, 74.85, 20) is not null as pinged \gset
insert into t select 'a new position clears "lost"', lost_at is null from public.consignments where code = :'kcode';
insert into t select 'and writes "back" in the events', exists (select 1 from public.consignment_events where code = :'kcode' and kind = 'back');

-- The right code ends the trip.
insert into t select 'the receiver''s code ends the trip', (public.kr_driver_delivered(:'tok', :'dcode') ->> 'ok')::boolean;
insert into t select 'delivered, and written in the events', status = 'delivered' and exists (select 1 from public.consignment_events where code = :'kcode' and kind = 'delivered') from public.consignments where code = :'kcode';

-- A second load: 5 wrong codes lock it; the right code no longer works from the driver's side.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a7', true);
insert into public.consignments (origin, destination) values ('Sopore', 'Jammu');
reset role;
select driver_token as tok2, delivery_code as dcode2 from public.consignments where origin = 'Sopore' \gset
select public.kr_driver_start(:'tok2', true) as s2 \gset
select public.kr_driver_delivered(:'tok2', case when :'dcode2' = '111111' then '222222' else '111111' end) from generate_series(1, 5);
insert into t select 'after 5 wrong codes the right one is refused', (public.kr_driver_delivered(:'tok2', :'dcode2') ->> 'locked')::boolean;
insert into t select 'the lock is written in the events', exists (select 1 from public.consignment_events e join public.consignments c on c.code = e.code where c.origin = 'Sopore' and e.kind = 'code_locked');
-- The sender can still mark it delivered themselves.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a7', true);
update public.consignments set status = 'delivered' where origin = 'Sopore';
insert into t select 'the sender reads their trip events', count(*) > 0 from public.consignment_events;
reset role;
insert into t select 'the sender can still mark it delivered', status = 'delivered' from public.consignments where origin = 'Sopore';
-- Nobody writes or removes events directly.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a7', true);
do $$ begin
  delete from public.consignment_events;
  insert into public.consignment_events (code, kind) values ((select code from public.consignments limit 1), 'back');
  insert into t values ('events cannot be written or removed directly', false);
exception when others then insert into t values ('events cannot be written or removed directly', true);
end $$;
reset role;

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: trip lock —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: the driver agrees and starts; only the receiver''s code ends the trip (5 wrong lock it); the code stays with the sender; 5 minutes without a position marks it lost and emails the sender once'
\endif
