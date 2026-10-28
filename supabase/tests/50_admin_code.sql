-- The admin code (20261104000000_admin_code_bcrypt.sql): an existing SHA-256 code still unlocks and
-- is then kept with bcrypt; a wrong code is refused and counted; a new code is saved with bcrypt.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ad', 'admin@test.in') on conflict do nothing;
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000ad', 'ADMIN') on conflict do nothing;
-- An admin who set "Saffron#2026" before this change (the old way).
insert into public.admin_lock (user_id, salt, code_hash) values ('00000000-0000-0000-0000-0000000000ad', 'oldsalt', public.kr_hash_code('oldsalt', 'Saffron#2026'));
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);
select set_config('request.jwt.claims', '{"session_id":"11111111-1111-1111-1111-111111111111"}', true);
set local role authenticated;
select public.kr_admin_unlock('wrong-code') as wrong \gset
select public.kr_admin_unlock('Saffron#2026') as first \gset
reset role;
select (code_hash like '$2%') as upgraded, failed from public.admin_lock where user_id = '00000000-0000-0000-0000-0000000000ad' \gset
set local role authenticated;
select public.kr_admin_unlock('Saffron#2026') as again \gset
select public.kr_admin_set_code('Walnut!7788', 'Saffron#2026');
select public.kr_admin_unlock('Walnut!7788') as new_code \gset
select public.kr_admin_unlock('Saffron#2026') as old_code_after_change \gset
reset role;
select (code_hash like '$2%') as new_bcrypt from public.admin_lock where user_id = '00000000-0000-0000-0000-0000000000ad' \gset
select (:'wrong' = 'wrong' and :'first' = 'unlocked' and :'upgraded'::boolean and :'failed' = '0' and :'again' = 'unlocked'
        and :'new_code' = 'unlocked' and :'old_code_after_change' = 'wrong' and :'new_bcrypt'::boolean) as ok \gset
\if :ok
\echo 'PASS: an old code still unlocks and is kept with bcrypt from then on; wrong codes refused; new codes bcrypt'
\else
\echo 'FAIL: admin code' :'wrong' :'first' :'upgraded' :'failed' :'again' :'new_code' :'old_code_after_change' :'new_bcrypt'
select 1 / 0 as fail;
\endif
