-- Emails from support (20261108000000_email_outbox.sql): a help request, a KashRoot reply and a payout
-- change queue an email by themselves; only the server (its secret) queues, takes and marks them;
-- nobody reads the queue directly; a failed send is tried again and given up after 5 tries; never
-- more than 450 sent in 24 hours; only admins see the counts. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'farmer@test.in'),
  ('00000000-0000-0000-0000-0000000000c3', 'other@test.in'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.in')
on conflict do nothing;
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000ad', 'ADMIN') on conflict do nothing;
select public.kr_kyc_secret() is not null as made \gset
select kyc_secret as s from public.kr_settings where id = 1 \gset
delete from public.email_outbox;

create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;

-- A help request (with an email) and one without: each queues one email to the support inbox.
select public.kr_support_open(:'s', 'Guest', '9123456780', 'guest@test.in', 'login', null, 'en', 'OTP does not come') as code_g \gset
select public.kr_support_open(:'s', 'Quiet', '9123456781', null, 'other', null, 'en', 'Where is my receipt') as code_q \gset
insert into t select 'a request queues help_new', count(*) = 2 from public.email_outbox where kind = 'help_new';

-- KashRoot replies twice to the guest (one email), once to the one without an email (none).
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true); select set_config('request.jwt.claims', '{"aal":"aal2"}', true); -- the admin passed two-step sign-in
select public.kr_support_reply((select id from public.support_requests where code = :'code_g'), 'Try again now', false);
select public.kr_support_reply((select id from public.support_requests where code = :'code_g'), 'And check spam', false);
select public.kr_support_reply((select id from public.support_requests where code = :'code_q'), 'Sent again', false);
reset role;
insert into t select 'replies: one email, to the address given', count(*) = 1 and min(to_email) = 'guest@test.in' from public.email_outbox where kind = 'help_reply';
-- A customer's own note queues nothing.
select public.kr_support_add(:'s', :'code_g', '9123456780', 'Still nothing') as added \gset
-- (3 = 2 help_new + 1 reply; 1 more: the acknowledgement to the guest who gave an email, 20261109000000_support_tracking.sql.)
insert into t select 'a customer note queues nothing more', count(*) = 4 from public.email_outbox;

-- Payout details: saving queues a notice; saving the same again does not; a change does.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
insert into public.payout_accounts (account_name, upi_id) values ('Farmer F', 'farmer@okbank');
update public.payout_accounts set bank_name = 'Same details' where user_id = '00000000-0000-0000-0000-0000000000f1';
update public.payout_accounts set upi_id = 'someone.else@okbank' where user_id = '00000000-0000-0000-0000-0000000000f1';
reset role;
insert into t select 'payout saved, then changed: two notices', count(*) = 2 from public.email_outbox where kind = 'payout_changed';

-- Nobody reads or writes the queue directly; nobody takes or marks emails without the secret.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
do $$ begin
  perform count(*) from public.email_outbox;
  insert into t values ('O cannot read the queue', false);
exception when others then insert into t values ('O cannot read the queue', true);
end $$;
do $$ begin
  perform public.kr_email_claim('wrong', 10);
  insert into t values ('no secret, no emails', false);
exception when others then insert into t values ('no secret, no emails', true);
end $$;
do $$ begin
  perform public.kr_email_enqueue('wrong', 'new_signin', '00000000-0000-0000-0000-0000000000c3', 'x');
  insert into t values ('no secret, nothing queued', false);
exception when others then insert into t values ('no secret, nothing queued', true);
end $$;
do $$ begin
  perform public.kr_email_status();
  insert into t values ('only admins see the counts', false);
exception when others then insert into t values ('only admins see the counts', true);
end $$;
reset role;
select set_config('kr.s', :'s', true);
set local role anon;
do $$ begin
  perform public.kr_email_enqueue(current_setting('kr.s', true), 'help_new', null, 'x');
  insert into t values ('the server cannot fake a help email kind', false);
exception when others then insert into t values ('the server cannot fake a help email kind', true);
end $$;
reset role;

-- The server queues a sign-in notice; it then takes everything due, with addresses.
insert into t values ('server queues a notice', public.kr_email_enqueue(:'s', 'new_signin', '00000000-0000-0000-0000-0000000000f1', 'Chrome on Android'));
create temp table c as select jsonb_array_elements(public.kr_email_claim(:'s', 20)) as e;
insert into t select 'all seven due are taken', count(*) = 7 from c;
insert into t select 'help_new carries the request, no address', bool_and(e->'to' = 'null'::jsonb and e->'help'->>'phone' is not null) from c where e->>'kind' = 'help_new';
insert into t select 'account notices go to the account email', bool_and(e->>'to' = 'farmer@test.in') from c where e->>'kind' in ('payout_changed', 'new_signin');
insert into t select 'taken ones are held', jsonb_array_length(public.kr_email_claim(:'s', 20)) = 0;

-- Sent; failed and tried again; given up after 5 tries.
select (select (e->>'id')::bigint from c where e->>'kind' = 'help_reply') as reply_id, (select (e->>'id')::bigint from c where e->>'kind' = 'new_signin') as signin_id \gset
select public.kr_email_done(:'s', :reply_id, true, null);
insert into t select 'marked sent', status = 'sent' and sent_at is not null from public.email_outbox where id = :reply_id;
select public.kr_email_done(:'s', :signin_id, false, 'SMTP 421 try later');
insert into t select 'a failure waits, then is tried again', status = 'pending' and next_try_at > now() and last_error = 'SMTP 421 try later' from public.email_outbox where id = :signin_id;
update public.email_outbox set attempts = 5 where id = :signin_id;
select public.kr_email_done(:'s', :signin_id, false, 'SMTP 535 bad login');
insert into t select 'given up after 5 tries', status = 'failed' from public.email_outbox where id = :signin_id;

-- The daily allowance: with 450 sent in the last 24 hours, nothing more goes out.
insert into public.email_outbox (kind, ref, status, sent_at) select 'help_new', 'H-OLD', 'sent', now() - interval '1 hour' from generate_series(1, 449);
insert into public.email_outbox (kind, user_id) values ('password_changed', '00000000-0000-0000-0000-0000000000f1');
insert into t select 'over the daily allowance: nothing taken', jsonb_array_length(public.kr_email_claim(:'s', 20)) = 0;

-- Admins see the counts.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true); select set_config('request.jwt.claims', '{"aal":"aal2"}', true); -- the admin passed two-step sign-in
insert into t select 'admin sees the counts', (public.kr_email_status() ->> 'sent_24h')::int = 450;
reset role;

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: email outbox —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: emails queued by themselves, server-only, retried, capped at 450 a day, admins see counts'
\endif
