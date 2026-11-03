-- Two-step before changing where people pay you (20261119000000_payout_two_step.sql): the first time,
-- payment details are added with a password sign-in (aal1); changing or removing them needs two-step
-- sign-in (aal2); with it, they change; nobody changes another person's details either way. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f5', 'seller@orchard.in'),
  ('00000000-0000-0000-0000-0000000000f9', 'thief@example.in')
on conflict do nothing;
-- Identity checks are not what this tests: let everyone through them here.
update public.kr_settings set kyc_required = false where id = 1;
create temp table t (step text, ok boolean);
grant all on t to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f5', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);
-- The first time: no two-step needed.
insert into public.payout_accounts (user_id, account_name, upi_id) values ('00000000-0000-0000-0000-0000000000f5', 'Seller', 'seller@okbank');
insert into t select 'added the first time without two-step', count(*) = 1 from public.payout_accounts;
-- Changing with only a password: nothing changes.
update public.payout_accounts set upi_id = 'thief@okbank' where user_id = '00000000-0000-0000-0000-0000000000f5';
insert into t select 'no change without two-step', upi_id = 'seller@okbank' from public.payout_accounts;
do $$ begin
  insert into public.payout_accounts (user_id, account_name, upi_id) values ('00000000-0000-0000-0000-0000000000f5', 'Seller', 'thief@okbank')
    on conflict (user_id) do update set upi_id = excluded.upi_id;
  insert into t values ('the form''s save (upsert) cannot change it either', false);
exception when others then insert into t values ('the form''s save (upsert) cannot change it either', true);
end $$;
-- Removing, to add new ones after: refused too.
delete from public.payout_accounts where user_id = '00000000-0000-0000-0000-0000000000f5';
insert into t select 'no removal without two-step', count(*) = 1 from public.payout_accounts;
-- Someone else, even with two-step, changes nothing of it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f9', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
update public.payout_accounts set upi_id = 'thief@okbank' where user_id = '00000000-0000-0000-0000-0000000000f5';
-- The owner, after two-step: it changes.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f5', true);
insert into t select 'another person''s two-step changes nothing', upi_id = 'seller@okbank' from public.payout_accounts;
update public.payout_accounts set upi_id = 'newbank@okbank' where user_id = '00000000-0000-0000-0000-0000000000f5';
insert into t select 'changed after two-step', upi_id = 'newbank@okbank' from public.payout_accounts;
reset role;
insert into t select 'the change is emailed to the account', count(*) >= 2 from public.email_outbox where kind = 'payout_changed' and user_id = '00000000-0000-0000-0000-0000000000f5';

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: payout two-step —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: payment details added once with a password; changing or removing them needs two-step; nobody changes another person''s'
\endif
