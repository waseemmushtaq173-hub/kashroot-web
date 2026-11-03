-- Business Owner consoles (20261115000000_business_consoles.sql): a business sees only its own people,
-- invites and payout details; staff cannot change bank details (nor can a manager; the owner only after
-- two-step sign-in); staff never see the account number; invites work only for their own email; the
-- last owner stays; the Super Admin sees and suspends any business, and a suspended one changes
-- nothing; nobody writes the tables directly. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email, phone) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner@coldstore.in', null),
  ('00000000-0000-0000-0000-0000000000b2', 'staff@coldstore.in', null),
  ('00000000-0000-0000-0000-0000000000b3', 'manager@coldstore.in', null),
  ('00000000-0000-0000-0000-0000000000b9', 'owner@dealer.in', null),
  ('00000000-0000-0000-0000-0000000000a1', 'kashroot08@gmail.com', null)
on conflict do nothing;
select public.kr_set_super_admin('kashroot08@gmail.com') as set \gset
create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);
-- Two businesses.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
insert into ids values ('cold', public.kr_org_create('Lolab Cold Store', 'cold_store'));
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
insert into ids values ('dealer', public.kr_org_create('Sopore Agro', 'dealer'));
-- The cold store's owner invites staff and a manager.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
insert into ids select 'inv_staff', public.kr_org_invite((select v from ids where k = 'cold'), 'Staff@ColdStore.in', 'staff');
insert into ids select 'inv_mgr', public.kr_org_invite((select v from ids where k = 'cold'), 'manager@coldstore.in', 'manager');
-- Someone else cannot use the staff invite.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
do $$ begin
  perform public.kr_org_accept((select v from ids where k = 'inv_staff'));
  insert into t values ('an invite works only for its own email', false);
exception when others then insert into t values ('an invite works only for its own email', true);
end $$;
-- The right people accept.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
insert into t select 'staff sees the invite', count(*) = 1 from public.kr_org_my_invites();
select public.kr_org_accept((select v from ids where k = 'inv_staff')) is not null as accepted \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true);
select public.kr_org_accept((select v from ids where k = 'inv_mgr')) is not null as accepted2 \gset

-- Each business sees only itself.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
insert into t select 'staff sees only their business', count(*) = 1 and min(name) = 'Lolab Cold Store' from public.organisations;
insert into t select 'staff sees their colleagues only', count(*) = 3 from public.org_members;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
insert into t select 'another business sees none of the cold store', count(*) = 0 from public.organisations where name = 'Lolab Cold Store';
insert into t select 'nor its people', count(*) = 0 from public.org_members where org_id = (select v from ids where k = 'cold');
do $$ begin
  perform public.kr_org_members((select v from ids where k = 'cold'));
  insert into t values ('nor its people list', false);
exception when others then insert into t values ('nor its people list', true);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
insert into t select 'staff see colleagues'' emails hidden', count(*) = 3 and count(*) filter (where label like '%•••') = 2
  from public.kr_org_members((select v from ids where k = 'cold'));
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
insert into t select 'the owner sees them in full', count(*) filter (where label = 'staff@coldstore.in') = 1
  from public.kr_org_members((select v from ids where k = 'cold'));
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b9', true);
do $$ begin
  perform public.kr_org_payout((select v from ids where k = 'cold'));
  insert into t values ('nor its payout details', false);
exception when others then insert into t values ('nor its payout details', true);
end $$;

-- Bank details: staff no, manager no, owner without two-step no, owner with it yes.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
do $$ begin
  perform public.kr_org_set_payout((select v from ids where k = 'cold'), 'Thief', 'thief@okbank', null, null, null);
  insert into t values ('staff cannot change bank details', false);
exception when others then insert into t values ('staff cannot change bank details', true);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true);
do $$ begin
  perform public.kr_org_set_payout((select v from ids where k = 'cold'), 'Manager', 'mgr@okbank', null, null, null);
  insert into t values ('a manager cannot change bank details', false);
exception when others then insert into t values ('a manager cannot change bank details', true);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  perform public.kr_org_set_payout((select v from ids where k = 'cold'), 'Lolab Cold Store', 'lolab@okbank', '001234567890', 'SBIN0001234', 'SBI');
  insert into t values ('the owner needs two-step sign-in', false);
exception when others then insert into t values ('the owner needs two-step sign-in', true);
end $$;
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select public.kr_org_set_payout((select v from ids where k = 'cold'), 'Lolab Cold Store', 'lolab@okbank', '001234567890', 'SBIN0001234', 'SBI');
insert into t values ('owner with two-step sign-in sets them', (public.kr_org_payout((select v from ids where k = 'cold')) ->> 'account_number') = '001234567890');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
insert into t values ('staff see the last 4 digits only', (public.kr_org_payout((select v from ids where k = 'cold')) ->> 'account_number') is null
  and (public.kr_org_payout((select v from ids where k = 'cold')) ->> 'account_end') = '7890');
-- Nobody writes the tables directly.
do $$ begin
  update public.org_payout_accounts set upi_id = 'thief@okbank';
  insert into t values ('no direct writes', false);
exception when others then insert into t values ('no direct writes', true);
end $$;
do $$ begin
  insert into public.org_members (org_id, user_id, role) values ((select v from ids where k = 'dealer'), '00000000-0000-0000-0000-0000000000b2', 'owner');
  insert into t values ('nobody adds themselves to a business', false);
exception when others then insert into t values ('nobody adds themselves to a business', true);
end $$;

-- Staff cannot remove people; the last owner stays.
do $$ begin
  perform public.kr_org_set_member((select v from ids where k = 'cold'), '00000000-0000-0000-0000-0000000000b3', null);
  insert into t values ('staff cannot remove a manager', false);
exception when others then insert into t values ('staff cannot remove a manager', true);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  perform public.kr_org_set_member((select v from ids where k = 'cold'), '00000000-0000-0000-0000-0000000000b1', 'staff');
  insert into t values ('the last owner stays', false);
exception when others then insert into t values ('the last owner stays', true);
end $$;

-- The Super Admin sees every business and suspends one; then it changes nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
insert into t select 'Super Admin sees every business', count(*) = 2 from public.kr_super_orgs();
insert into t values ('Super Admin reads any payout', (public.kr_org_payout((select v from ids where k = 'cold')) ->> 'account_end') = '7890');
insert into t values ('Super Admin suspends', public.kr_super_suspend_org((select v from ids where k = 'cold'), 'Fake receipts reported', true) = 'suspended');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$ begin
  perform public.kr_org_invite((select v from ids where k = 'cold'), 'new@coldstore.in', 'staff');
  insert into t values ('a suspended business changes nothing', false);
exception when others then insert into t values ('a suspended business changes nothing', true);
end $$;
insert into t select 'the owner sees why', suspended_reason = 'Fake receipts reported' from public.organisations where id = (select v from ids where k = 'cold');
reset role;
insert into t select 'audited', count(*) = 1 from public.audit_log where action = 'suspend_business';
insert into t select 'owners heard of the payout change', count(*) = 1 from public.email_outbox where kind = 'payout_changed' and user_id = '00000000-0000-0000-0000-0000000000b1';

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: business consoles —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: each business sees only itself; staff and managers cannot change bank details; owner needs two-step; Super Admin sees and suspends all'
\endif
