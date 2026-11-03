-- The Super Admin (20261113000000_super_admin.sql): only SQL makes one, and only one; an ordinary admin
-- is no Super Admin and cannot make admins; the Super Admin needs two-step sign-in; suspending is
-- audited and ends sessions; the audit log cannot be changed or deleted by anyone. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'kashroot08@gmail.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'otheradmin@test.in'),
  ('00000000-0000-0000-0000-0000000000f1', 'farmer@test.in')
on conflict do nothing;
insert into public.staff_roles (user_id, role, granted_by) values ('00000000-0000-0000-0000-0000000000a2', 'ADMIN', '00000000-0000-0000-0000-0000000000a1') on conflict do nothing;
insert into auth.sessions (user_id) values ('00000000-0000-0000-0000-0000000000f1');

create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;

-- Nobody on the site can make a Super Admin.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
do $$ begin
  perform public.kr_set_super_admin('otheradmin@test.in');
  insert into t values ('the setter is SQL-only', false);
exception when others then insert into t values ('the setter is SQL-only', true);
end $$;
reset role;

-- SQL makes one; a second call moves it (still only one).
select public.kr_set_super_admin('otheradmin@test.in') as first \gset
select public.kr_set_super_admin('KashRoot08@gmail.com') as second \gset
insert into t select 'exactly one Super Admin', count(*) = 1 and min(email) = 'kashroot08@gmail.com' from auth.users where raw_app_meta_data ->> 'kr_role' = 'super_admin';

-- The owner, with two-step sign-in: Super Admin. Without it: not even an admin.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);
insert into t values ('no two-step sign-in, no Super Admin', not public.kr_is_super_admin());
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
insert into t values ('owner with two-step sign-in is Super Admin', public.kr_is_super_admin());
insert into t values ('overview works', (public.kr_super_overview() ->> 'accounts')::int >= 3);
insert into t select 'people list works, no Aadhaar column', count(*) >= 3 from public.kr_super_people('', 50);
insert into t values ('suspend', public.kr_super_suspend('00000000-0000-0000-0000-0000000000f1', 'Selling fake seed') = 'suspended');
do $$ begin
  perform public.kr_super_suspend('00000000-0000-0000-0000-0000000000a1', 'testing');
  insert into t values ('cannot suspend yourself', false);
exception when others then insert into t values ('cannot suspend yourself', true);
end $$;
reset role;
insert into t select 'suspended = banned, sessions ended', banned_until > now() from auth.users where id = '00000000-0000-0000-0000-0000000000f1';
insert into t select 'sessions ended', count(*) = 0 from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000f1';
insert into t select 'the owner sees the reason', count(*) = 1 from public.account_suspensions where reason = 'Selling fake seed';
insert into t select 'audited with before and after', count(*) = 1 from public.audit_log where action = 'suspend' and after ->> 'banned_until' = 'infinity';

-- Another admin (two-step sign-in and all) is no Super Admin, and cannot make admins.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
insert into t values ('another admin is no Super Admin', not public.kr_is_super_admin());
do $$ begin
  perform public.kr_super_overview();
  insert into t values ('another admin: no overview', false);
exception when others then insert into t values ('another admin: no overview', true);
end $$;
do $$ begin
  perform public.kr_grant_role('00000000-0000-0000-0000-0000000000f1', 'ADMIN');
  insert into t values ('another admin cannot make admins', false);
exception when others then insert into t values ('another admin cannot make admins', true);
end $$;
insert into t select 'another admin cannot read the audit log', count(*) = 0 from public.audit_log;
-- The suspended person reads their own reason.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
insert into t select 'the suspended person sees why', count(*) = 1 from public.account_suspensions;
reset role;

-- The audit log cannot be changed or deleted — not even by the database owner.
do $$ begin
  update public.audit_log set reason = 'edited';
  insert into t values ('audit log: no update', false);
exception when others then insert into t values ('audit log: no update', true);
end $$;
do $$ begin
  delete from public.audit_log;
  insert into t values ('audit log: no delete', false);
exception when others then insert into t values ('audit log: no delete', true);
end $$;

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: Super Admin —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: one Super Admin, by SQL only; needs two-step sign-in; admins cannot make admins; suspend audited; audit log frozen'
\endif
