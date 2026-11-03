-- The KashRoot team (20261117000000_kashroot_team.sql): only the Super Admin and the team they add reach
-- Admin; a team member sees only the sections ticked for them (none at first), and only after two-step
-- sign-in; dealers, business owners and staff, farmers and buyers reach nothing — no admin function,
-- no admin rows; nobody gives themselves admin or team access; every team change is audited and
-- emailed to the support inbox. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'kashroot08@gmail.com'),
  ('00000000-0000-0000-0000-0000000000e1', 'teammate@kashroot.in'),
  ('00000000-0000-0000-0000-0000000000d1', 'dealer@shop.in'),
  ('00000000-0000-0000-0000-0000000000d2', 'owner@coldstore.in'),
  ('00000000-0000-0000-0000-0000000000d3', 'staff@coldstore.in'),
  ('00000000-0000-0000-0000-0000000000d4', 'farmer@orchard.in')
on conflict do nothing;
select public.kr_set_super_admin('kashroot08@gmail.com') as set \gset
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000d1', 'DEALER') on conflict do nothing;
insert into public.organisations (id, name, kind, created_by) values ('00000000-0000-0000-0000-00000000ab01', 'Approved Store', 'cold_store', '00000000-0000-0000-0000-0000000000d2');
insert into public.org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-0000000000d2', 'owner'),
  ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-0000000000d3', 'staff');
-- Admin-only rows to look for.
insert into public.support_requests (code, name, phone, topic, message) values ('H-TEAM0001', 'Someone', '9876543210', 'other', 'Please help me sign in to my account.');
insert into public.security_events (kind, detail) values ('signin_fail', 'team test');
create temp table t (step text, ok boolean);
grant all on t to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

-- ── Everyone outside the team, even with two-step sign-in: nothing ──
do $$
declare who text; uid uuid; fn text; n int;
begin
  foreach who in array array['dealer', 'business owner', 'business staff', 'farmer'] loop
    uid := case who when 'dealer' then '00000000-0000-0000-0000-0000000000d1' when 'business owner' then '00000000-0000-0000-0000-0000000000d2'
                    when 'business staff' then '00000000-0000-0000-0000-0000000000d3' else '00000000-0000-0000-0000-0000000000d4' end;
    perform set_config('request.jwt.claim.sub', uid::text, true);
    insert into t values (who || ': no sections', public.kr_team_sections() = '{}');
    insert into t values (who || ': no Admin card', not public.kr_team_member());
    foreach fn in array array['kr_super_team()', 'kr_admin_accounts()', 'kr_setup_status()', 'kr_super_orgs()', 'kr_admin_stats()', 'kr_security_summary(24)', 'kr_super_overview()', 'kr_email_status()'] loop
      begin
        execute 'select 1 from public.' || fn || ' limit 1';
        insert into t values (who || ': refused ' || fn, false);
      exception when others then insert into t values (who || ': refused ' || fn, true);
      end;
    end loop;
    select count(*) into n from public.support_requests; insert into t values (who || ': no help requests', n = 0);
    select count(*) into n from public.security_events; insert into t values (who || ': no security events', n = 0);
    select count(*) into n from public.audit_log; insert into t values (who || ': no audit log', n = 0);
    select count(*) into n from public.staff_roles where user_id <> uid; insert into t values (who || ': no one else''s roles', n = 0);
    -- Nobody gives themselves admin or team access.
    foreach fn in array array[
      format('insert into public.staff_roles (user_id, role) values (%L, ''ADMIN'')', uid),
      format('insert into public.team_sections (user_id, section) values (%L, ''help'')', uid),
      format('select public.kr_grant_role(%L, ''ADMIN'')', uid),
      format('select public.kr_add_admin(%L)', who),
      format('select public.kr_super_set_admin(%L, true, null)', uid),
      format('select public.kr_super_team_add(%L)', 'dealer@shop.in'),
      format('select public.kr_super_team_set(%L, array[''help''])', uid)] loop
      begin
        execute fn;
        insert into t values (who || ': cannot ' || left(fn, 40), false);
      exception when others then insert into t values (who || ': cannot ' || left(fn, 40), true);
      end;
    end loop;
  end loop;
end $$;

-- ── The Super Admin adds a team member: nothing ticked yet ──
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
insert into t values ('Super Admin sees everything', public.kr_team_sections() = array['*']);
select public.kr_super_team_add('TeamMate@kashroot.in') is not null as added \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
insert into t values ('new team member: Admin card', public.kr_team_member() = false); -- nothing ticked: no card yet
insert into t values ('new team member: no sections', public.kr_team_sections() = '{}');
insert into t select 'new team member: no help requests', count(*) = 0 from public.support_requests;
-- A team member cannot add, tick or give Admin.
do $$ begin
  perform public.kr_super_team_add('dealer@shop.in');
  insert into t values ('team member cannot add to the team', false);
exception when others then insert into t values ('team member cannot add to the team', true);
end $$;
do $$ begin
  perform public.kr_super_team_set('00000000-0000-0000-0000-0000000000e1', array['help', 'security']);
  insert into t values ('team member cannot tick for themselves', false);
exception when others then insert into t values ('team member cannot tick for themselves', true);
end $$;

-- ── Help desk ticked: exactly that, and only after two-step sign-in ──
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.kr_super_team_set('00000000-0000-0000-0000-0000000000e1', array['help']) as ticked \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
insert into t values ('ticked: Admin card', public.kr_team_member());
insert into t values ('ticked: help only', public.kr_team_sections() = array['help']);
insert into t select 'ticked: sees help requests', count(*) = 1 from public.support_requests;
insert into t select 'ticked: still no security events', count(*) = 0 from public.security_events;
do $$ begin
  perform * from public.kr_admin_accounts();
  insert into t values ('ticked: still no accounts list', false);
exception when others then insert into t values ('ticked: still no accounts list', true);
end $$;
do $$ begin
  perform * from public.kr_super_orgs();
  insert into t values ('ticked: still no businesses', false);
exception when others then insert into t values ('ticked: still no businesses', true);
end $$;
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);
insert into t values ('without two-step: nothing', public.kr_team_sections() = '{}');
insert into t select 'without two-step: no help requests', count(*) = 0 from public.support_requests;
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);

-- ── Removed: everything goes; the Super Admin cannot remove themselves ──
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ begin
  perform public.kr_super_team_remove('00000000-0000-0000-0000-0000000000a1');
  insert into t values ('Super Admin stays', false);
exception when others then insert into t values ('Super Admin stays', true);
end $$;
select public.kr_super_team_remove('00000000-0000-0000-0000-0000000000e1');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
insert into t values ('removed: nothing', public.kr_team_sections() = '{}' and not public.kr_team_member());
reset role;
insert into t select 'removed: no Admin role, no ticks', not exists (select 1 from public.staff_roles where user_id = '00000000-0000-0000-0000-0000000000e1' and role = 'ADMIN')
  and not exists (select 1 from public.team_sections where user_id = '00000000-0000-0000-0000-0000000000e1');
insert into t select 'every change audited', count(*) = 3 from public.audit_log where action in ('team_add', 'team_sections', 'team_remove');
insert into t select 'every change emailed to the support inbox', count(*) = 3 from public.email_outbox where kind = 'team_changed' and user_id is null;

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: KashRoot team —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: only the Super Admin and the team reach Admin; a team member sees only what is ticked, after two-step; nobody gives themselves access; every change audited and emailed'
\endif
