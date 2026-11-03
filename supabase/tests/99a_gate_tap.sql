-- "Ask everyone to tap the box" (20261114000000_gate_tap.sql): anyone reads it (the gate needs to);
-- only the Super Admin changes it, and that is audited. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'kashroot08@gmail.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'otheradmin@test.in')
on conflict do nothing;
insert into public.staff_roles (user_id, role, granted_by) values ('00000000-0000-0000-0000-0000000000a2', 'ADMIN', '00000000-0000-0000-0000-0000000000a1') on conflict do nothing;
select public.kr_set_super_admin('kashroot08@gmail.com') as set \gset
create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;

set local role anon;
insert into t values ('anyone reads it; off by default', (public.kr_gate_settings() ->> 'tap')::boolean = false);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$ begin
  perform public.kr_super_set_gate_tap(true);
  insert into t values ('another admin cannot switch it', false);
exception when others then insert into t values ('another admin cannot switch it', true);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
insert into t values ('the Super Admin switches it on', public.kr_super_set_gate_tap(true));
reset role;
insert into t values ('now on for everyone', (public.kr_gate_settings() ->> 'tap')::boolean);
insert into t select 'audited', count(*) = 1 from public.audit_log where action = 'set_gate_tap' and (after ->> 'tap')::boolean;

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: gate tap switch —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: tap switch readable by all, changed by the Super Admin only, audited'
\endif
