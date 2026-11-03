-- Two-step sign-in for admins (20261111000000_admin_mfa.sql): an admin whose session has not passed
-- the authenticator (aal1) is not an admin anywhere — admin functions and admin-only rows refuse; the
-- portal is told whether to set one up or to use it; with it (aal2) admin works as before; the access
-- code cannot be entered without it; nobody else gains anything from aal2. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test.in'),
  ('00000000-0000-0000-0000-0000000000f1', 'farmer@test.in')
on conflict do nothing;
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000ad', 'ADMIN') on conflict do nothing;
-- A KashRoot team member with the help section ticked (20261117000000_kashroot_team.sql).
insert into public.team_sections (user_id, section) values ('00000000-0000-0000-0000-0000000000ad', 'help') on conflict do nothing;
select public.kr_kyc_secret() is not null as made \gset
select kyc_secret as s from public.kr_settings where id = 1 \gset
select public.kr_support_open(:'s', 'Farmer F', '9876543210', null, 'login', null, 'en', 'OTP does not come') as code \gset

create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);

-- No authenticator yet, password only (aal1): set one up first; not an admin anywhere.
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);
insert into t values ('no authenticator: told to set one up', public.kr_admin_status() = 'mfa_setup');
insert into t values ('aal1: not an admin', not public.kr_has_role('ADMIN'));
insert into t select 'aal1: admin-only rows hidden', count(*) = 0 from public.support_requests;
do $$ begin
  perform public.kr_setup_status();
  insert into t values ('aal1: admin functions refuse', false);
exception when others then insert into t values ('aal1: admin functions refuse', true);
end $$;
do $$ begin
  perform public.kr_admin_unlock('Saffron#2026');
  insert into t values ('aal1: the access code cannot be entered', false);
exception when others then insert into t values ('aal1: the access code cannot be entered', true);
end $$;

-- An authenticator, but this session has not used it: told to use it.
reset role;
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-0000000000ad', 'verified');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);
insert into t values ('has one, not used: told to use it', public.kr_admin_status() = 'mfa_verify');
insert into t values ('still not an admin', not public.kr_has_role('ADMIN'));

-- Passed it (aal2): admin as before.
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
insert into t values ('aal2: admin', public.kr_has_role('ADMIN'));
insert into t select 'aal2: admin-only rows visible', count(*) = 1 from public.support_requests;
insert into t values ('aal2: status moves on to the access code', public.kr_admin_status() in ('no_code', 'unlocked'));

-- aal2 alone makes nobody an admin.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
insert into t values ('a farmer with aal2 is no admin', not public.kr_has_role('ADMIN') and public.kr_admin_status() = 'not_admin');
reset role;

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: admin two-step sign-in —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: admins need two-step sign-in (aal2) in the database; set up or use it first; aal2 alone grants nothing'
\endif
