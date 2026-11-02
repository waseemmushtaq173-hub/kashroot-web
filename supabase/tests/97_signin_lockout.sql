-- Sign-in lock notices (20261110000000_signin_lockout.sql): only the server queues them; an existing
-- account gets one; an unknown email queues nothing but gets the very same answer; no other kind. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'farmer@test.in') on conflict do nothing;
select public.kr_kyc_secret() is not null as made \gset
select kyc_secret as s from public.kr_settings where id = 1 \gset
delete from public.email_outbox;
create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;

insert into t values ('known account: queued', public.kr_email_enqueue_email(:'s', 'signin_locked', ' Farmer@Test.IN ', '15 minutes'));
insert into t select 'to that account', count(*) = 1 from public.email_outbox where kind = 'signin_locked' and user_id = '00000000-0000-0000-0000-0000000000f1';
insert into t values ('unknown email: same answer', public.kr_email_enqueue_email(:'s', 'signin_locked', 'nobody@test.in', '15 minutes'));
insert into t select 'unknown email: nothing queued', count(*) = 1 from public.email_outbox;
set local role anon;
do $$ begin
  perform public.kr_email_enqueue_email('wrong', 'signin_locked', 'farmer@test.in', 'x');
  insert into t values ('no secret refused', false);
exception when others then insert into t values ('no secret refused', true);
end $$;
reset role;
select set_config('kr.s', :'s', true);
do $$ begin
  perform public.kr_email_enqueue_email(current_setting('kr.s'), 'help_new', 'farmer@test.in', 'x');
  insert into t values ('only lock notices', false);
exception when others then insert into t values ('only lock notices', true);
end $$;

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: sign-in lock notices —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: lock notices server-only, to the account, unknown emails give the same answer'
\endif
