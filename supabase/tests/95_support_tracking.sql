-- Help requests followed to the end (20261109000000_support_tracking.sql): found by code + mobile OR
-- email (never by code alone); internal notes hidden from the customer everywhere; only admins set
-- the status or write notes; the customer settles their own request (by contact, or as its signed-in
-- owner — never someone else's); the right emails are queued (acknowledgement, reply with its words,
-- resolved — but not when the customer marked it solved). Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'farmer@test.in'),
  ('00000000-0000-0000-0000-0000000000c3', 'other@test.in'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.in')
on conflict do nothing;
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000ad', 'ADMIN') on conflict do nothing;
-- A KashRoot team member with the help section ticked (20261117000000_kashroot_team.sql).
insert into public.team_sections (user_id, section) values ('00000000-0000-0000-0000-0000000000ad', 'help') on conflict do nothing;
select public.kr_kyc_secret() is not null as made \gset
select kyc_secret as s from public.kr_settings where id = 1 \gset
delete from public.email_outbox;

create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;

-- F (signed in, with an email) and a guest (no email) open requests.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
select public.kr_support_open(:'s', 'Farmer F', '9876543210', 'Farmer@Test.in', 'login', 'farmer', 'en', 'OTP does not come') as code_f \gset
reset role;
select public.kr_support_open(:'s', 'Guest', '9123456780', null, 'other', null, 'en', 'Where is my receipt') as code_g \gset
insert into t select 'acknowledgement only to the one with an email', count(*) = 1 and min(to_email) = 'Farmer@Test.in' from public.email_outbox where kind = 'help_ack';

-- Found by code + mobile, or code + email (any case); never by code alone or a wrong contact.
insert into t values ('by mobile', (public.kr_support_status(:'s', :'code_f', '9876543210') ->> 'status') = 'open');
insert into t values ('by email', (public.kr_support_status(:'s', :'code_f', ' farmer@test.IN ') ->> 'status') = 'open');
insert into t values ('wrong email finds nothing', public.kr_support_status(:'s', :'code_f', 'other@test.in') is null);
insert into t values ('empty contact finds nothing', public.kr_support_status(:'s', :'code_f', '') is null);
insert into t values ('guest has no email to match', public.kr_support_status(:'s', :'code_g', '') is null);

-- Staff: status, a reply, an internal note.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true); select set_config('request.jwt.claims', '{"aal":"aal2"}', true); -- the admin passed two-step sign-in
select public.kr_support_set_status((select id from public.support_requests where code = :'code_f'), 'in_progress');
select public.kr_support_note((select id from public.support_requests where code = :'code_f'), 'Checked: SMS gateway delay');
select public.kr_support_reply((select id from public.support_requests where code = :'code_f'), 'Please try again now.', false);
reset role;
insert into t values ('being looked at, then answered', (public.kr_support_status(:'s', :'code_f', '9876543210') ->> 'status') = 'answered');
insert into t select 'customer never sees the internal note (by code)', not (public.kr_support_status(:'s', :'code_f', '9876543210')::text like '%SMS gateway%');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
insert into t select 'customer never sees the internal note (signed in)', count(*) = 0 from public.support_messages where body like '%SMS gateway%';
insert into t select 'customer sees the reply', count(*) = 1 from public.support_messages where author = 'kashroot';
-- Not an admin: no status, no notes, no settling someone else's request.
do $$ begin
  perform public.kr_support_set_status((select id from public.support_requests limit 1), 'closed');
  insert into t values ('customer cannot set status', false);
exception when others then insert into t values ('customer cannot set status', true);
end $$;
do $$ begin
  perform public.kr_support_note((select id from public.support_requests limit 1), 'x');
  insert into t values ('customer cannot write notes', false);
exception when others then insert into t values ('customer cannot write notes', true);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
insert into t values ('O cannot settle F''s request', public.kr_support_feedback_mine(:'code_f', true) = false);
reset role;
set local role anon;
do $$ begin
  perform public.kr_support_feedback('wrong', 'H-1', '9876543210', true);
  insert into t values ('no secret, no feedback', false);
exception when others then insert into t values ('no secret, no feedback', true);
end $$;
reset role;
insert into t values ('admin sees the note', exists (select 1 from public.support_messages where author = 'internal'));
insert into t select 'the reply email carries the reply', (e->>'reply') = 'Please try again now.' and e->>'to' = 'Farmer@Test.in'
  from (select jsonb_array_elements(public.kr_email_claim(:'s', 20)) as e) x where e->>'kind' = 'help_reply';
insert into t select 'internal notes email nobody', count(*) = 0 from public.email_outbox where ref = :'code_f' and kind not in ('help_new', 'help_ack', 'help_reply');

-- "Still need help" reopens; "This solved my problem" resolves — and sends no "resolved" email back.
insert into t values ('still need help reopens', public.kr_support_feedback(:'s', :'code_f', 'farmer@test.in', false) and (public.kr_support_status(:'s', :'code_f', '9876543210') ->> 'status') = 'open');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
insert into t values ('owner marks it solved', public.kr_support_feedback_mine(:'code_f', true));
reset role;
insert into t values ('resolved', (public.kr_support_status(:'s', :'code_f', '9876543210') ->> 'status') = 'closed');
insert into t select 'no resolved email when they solved it', count(*) = 0 from public.email_outbox where kind = 'help_resolved';

-- Resolved by KashRoot: the person gets the email.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true); select set_config('request.jwt.claims', '{"aal":"aal2"}', true); -- the admin passed two-step sign-in
select public.kr_support_set_status((select id from public.support_requests where code = :'code_f'), 'open');
select public.kr_support_set_status((select id from public.support_requests where code = :'code_f'), 'closed');
reset role;
insert into t select 'resolved by KashRoot emails them', count(*) = 1 from public.email_outbox where kind = 'help_resolved' and ref = :'code_f';

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: support tracking —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: requests by code + mobile or email, internal notes hidden, admins only, customers settle their own, right emails'
\endif
