-- Help & support (20261105000000_support_desk.sql): only the server opens and checks requests;
-- a request is found only with its code AND its phone; farmer F sees their own requests, outsider O
-- and anon see none; nobody writes the tables directly; only an admin replies. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'farmer@test.in'),
  ('00000000-0000-0000-0000-0000000000c3', 'other@test.in'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.in')
on conflict do nothing;
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000ad', 'ADMIN') on conflict do nothing;
select public.kr_kyc_secret() is not null as made \gset
select kyc_secret as s from public.kr_settings where id = 1 \gset

create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;

-- Without the server's secret: refused.
set local role anon;
do $$ begin
  perform public.kr_support_open('wrong', 'Anyone', '9876543210', null, 'login', null, 'en', 'I cannot sign in');
  insert into t values ('no secret refused', false);
exception when others then insert into t values ('no secret refused', true);
end $$;
reset role;

-- F, signed in, opens one through the server; a signed-out person opens another.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
select public.kr_support_open(:'s', 'Farmer F', '9876543210', null, 'login', 'farmer', 'hi', 'OTP does not come') as code_f \gset
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select public.kr_support_open(:'s', 'Guest', '9123456780', null, 'other', null, 'en', 'Where is my receipt') as code_g \gset
reset role;
insert into t select 'F''s request is F''s', user_id = '00000000-0000-0000-0000-0000000000f1' from public.support_requests where code = :'code_f';
insert into t select 'guest request has no account', user_id is null from public.support_requests where code = :'code_g';

-- Found only with code AND phone.
insert into t values ('wrong phone finds nothing', public.kr_support_status(:'s', :'code_f', '9000000000') is null);
insert into t values ('code + phone finds it', (public.kr_support_status(:'s', lower(:'code_f'), '9876543210') ->> 'status') = 'open');
insert into t values ('no secret, no status', false);
do $$ begin
  perform public.kr_support_status('wrong', 'H-X', '9876543210');
exception when others then update t set ok = true where step = 'no secret, no status';
end $$;

-- Who sees what.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
insert into t select 'F sees only their own', count(*) = 1 from public.support_requests;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
insert into t select 'O sees none', count(*) = 0 from public.support_requests;
-- Nobody writes directly, nor replies without being an admin.
do $$ begin
  update public.support_requests set status = 'closed';
  insert into t values ('O cannot change', false);
exception when others then insert into t values ('O cannot change', true);
end $$;
do $$ begin
  insert into public.support_messages (request_id, author, body) select id, 'kashroot', 'fake reply' from public.support_requests limit 1;
  insert into t values ('O cannot write a reply', false);
exception when others then insert into t values ('O cannot write a reply', true);
end $$;
do $$ begin
  perform public.kr_support_reply(gen_random_uuid(), 'hi', false);
  insert into t values ('only admins reply', false);
exception when others then insert into t values ('only admins reply', true);
end $$;
reset role;
set local role anon;
do $$ begin
  perform count(*) from public.support_requests;
  insert into t values ('anon reads nothing', false);
exception when others then insert into t values ('anon reads nothing', true);
end $$;
reset role;

-- The admin sees all and replies; F then sees the reply; F's note opens it again.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);
insert into t select 'admin sees all', count(*) = 2 from public.support_requests;
select id as rid from public.support_requests where code = :'code_f' \gset
insert into t values ('admin replies', public.kr_support_reply(:'rid', 'Please use Continue as on the sign-in page.', false));
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
insert into t select 'F sees the reply', count(*) = 1 from public.support_messages where author = 'kashroot';
reset role;
insert into t values ('answered', (public.kr_support_status(:'s', :'code_f', '9876543210') ->> 'status') = 'answered');
insert into t values ('a note reopens it', public.kr_support_add(:'s', :'code_f', '9876543210', 'Still no OTP') and (public.kr_support_status(:'s', :'code_f', '9876543210') ->> 'status') = 'open');

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: support desk —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: support requests: server-only, code + phone, own rows only, admins reply'
\endif
