-- Security hardening (20261106000000_security_hardening.sql): a shared count can be read and
-- cleared only by the server; security events are written only by the server and read only by
-- admins; photos must really be JPEG / PNG / WebP (an SVG or a renamed file is refused). Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'farmer@test.in'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.in')
on conflict do nothing;
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000ad', 'ADMIN') on conflict do nothing;
select public.kr_kyc_secret() is not null as made \gset
select kyc_secret as s from public.kr_settings where id = 1 \gset
create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;

-- 1. Peek and clear.
select public.kr_rate_hit(:'s', 'pw', 8, 900);
select public.kr_rate_hit(:'s', 'pw', 8, 900);
insert into t values ('peek counts without adding', public.kr_rate_peek(:'s', 'pw', 900) = 2 and public.kr_rate_peek(:'s', 'pw', 900) = 2);
insert into t values ('wrong secret peeks nothing', public.kr_rate_peek('wrong', 'pw', 900) = 0);
insert into t values ('clear', public.kr_rate_clear(:'s', 'pw') and public.kr_rate_peek(:'s', 'pw', 900) = 0);

-- 2. Events.
set local role anon;
insert into t values ('anon cannot log without the secret', not public.kr_log_event('wrong', 'signin_fail', 'ip', 'who', '/x', 400, null));
insert into t values ('server logs', public.kr_log_event(:'s', 'signin_fail', 'iphash', 'whohash', 'auth/v1/token', 400, null));
insert into t values ('unknown kinds refused', not public.kr_log_event(:'s', 'made_up', 'iphash', null, null, null, null));
do $$ begin
  perform count(*) from public.security_events;
  insert into t values ('anon reads no events', false);
exception when others then insert into t values ('anon reads no events', true);
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
insert into t select 'a user reads no events', count(*) = 0 from public.security_events;
do $$ begin
  perform * from public.kr_security_summary(24);
  insert into t values ('a user gets no summary', false);
exception when others then insert into t values ('a user gets no summary', true);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);
insert into t select 'the admin reads them', count(*) = 1 from public.security_events;
insert into t select 'the admin summary', events = 1 and top_network = 'iphash' from public.kr_security_summary(24) where kind = 'signin_fail';
reset role;

-- 3. Photos.
insert into t values ('a JPEG passes', public.kr_image_ok('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'));
insert into t values ('a PNG passes', public.kr_image_ok('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'));
insert into t values ('a WebP passes', public.kr_image_ok('data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAw'));
insert into t values ('an SVG is refused', not public.kr_image_ok('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcv'));
insert into t values ('a renamed file is refused', not public.kr_image_ok('data:image/jpeg;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg'));
insert into t values ('too big is refused', not public.kr_image_ok('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD' || repeat('A', 600000)));
insert into t values ('cold store photos check it', not public.kr_store_photos_ok('[{"src":"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcv"}]'::jsonb));
insert into t values ('listing photos check it', not public.kr_photos_ok(array['data:image/jpeg;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg']));

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: security hardening —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: shared counts server-only, events server-written and admin-read, photos must be real JPEG/PNG/WebP'
\endif
