-- KashRoot: one Super Admin (the owner), an audit log nobody can change, and
-- the Super Admin's first powers. Stage 1 of the Super Admin console.
--
-- Who is the Super Admin — all of these at once, checked in the database:
--   * the account's app metadata says kr_role = super_admin (people cannot
--     edit their own app metadata; only SQL can),
--   * its email is the one kept in kr_settings.super_admin_email,
--   * it is an admin in a session that passed two-step sign-in and the
--     access code (kr_has_role('ADMIN')).
-- Set ONLY by SQL in the Supabase SQL Editor:
--     select public.kr_set_super_admin('kashroot08@gmail.com');
-- It clears anyone else first. No page, API or database function anyone can
-- call from the site can make a Super Admin (the setter is revoked from them).
--
-- audit_log: who, what, when, before and after, why. Append-only: the
-- database refuses to change or delete a row, even for the Super Admin; only
-- the Super Admin reads it. Every Super Admin action writes one.
--
-- Powers (each audited): an overview of everything; the people list (roles,
-- two-step sign-in, identity check status — never an Aadhaar number —, last
-- sign-in, suspension); suspend / re-enable an account with a reason (a
-- Supabase ban: signing in and refreshing stop at once, and its sessions are
-- ended); give or take Admin; note an export.
-- Also: only the Super Admin (or, before one is set, the owner) can give
-- Admin — no admin can make another admin any more.
-- Run after 20261112000000_security_gate.sql. Safe to run again.

alter table public.kr_settings add column if not exists super_admin_email text;

-- ── Who ──
create or replace function public.kr_is_super_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select public.kr_has_role('ADMIN')
     and exists (
       select 1 from auth.users u, public.kr_settings s
        where u.id = auth.uid() and s.id = 1
          and s.super_admin_email is not null
          and lower(u.email) = lower(s.super_admin_email)
          and coalesce(u.raw_app_meta_data ->> 'kr_role', '') = 'super_admin'
     )
$$;
grant execute on function public.kr_is_super_admin() to authenticated;

-- The owner: the Super Admin once one is set; before that, the first admin (as before).
create or replace function public.kr_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.kr_settings where id = 1 and super_admin_email is not null) then public.kr_is_super_admin()
    else public.kr_has_role('ADMIN') and exists (select 1 from public.staff_roles where user_id = auth.uid() and role = 'ADMIN' and granted_by is null)
  end
$$;

-- ── The audit log ──
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  actor_email text,
  action      text not null check (char_length(action) between 1 and 60),
  target      text check (target is null or char_length(target) <= 200),
  before      jsonb,
  after       jsonb,
  reason      text check (reason is null or char_length(reason) <= 500)
);
create index if not exists audit_log_at on public.audit_log (at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
drop policy if exists "Super Admin reads the audit log" on public.audit_log;
create policy "Super Admin reads the audit log" on public.audit_log for select to authenticated using (public.kr_is_super_admin());

-- Append-only: no change and no delete, by anyone.
create or replace function public.kr_audit_log_frozen() returns trigger
language plpgsql as $$
begin
  raise exception 'The audit log cannot be changed or deleted.' using errcode = '42501';
end $$;
drop trigger if exists audit_log_frozen on public.audit_log;
create trigger audit_log_frozen before update or delete on public.audit_log for each row execute function public.kr_audit_log_frozen();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log for each statement execute function public.kr_audit_log_frozen();

-- Write one entry (inside KashRoot's own functions only).
create or replace function public.kr_audit(p_action text, p_target text, p_before jsonb, p_after jsonb, p_reason text) returns void
language sql security definer set search_path = public, auth as $$
  insert into public.audit_log (actor, actor_email, action, target, before, after, reason)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), left(p_action, 60), left(p_target, 200), p_before, p_after, left(p_reason, 500))
$$;
revoke all on function public.kr_audit(text, text, jsonb, jsonb, text) from public, anon, authenticated;

-- ── Set the Super Admin (SQL Editor only) ──
create or replace function public.kr_set_super_admin(p_email text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then return 'No account with that email: create it on the website first, then run this again.'; end if;
  -- Exactly one: everyone else loses it.
  update auth.users set raw_app_meta_data = raw_app_meta_data - 'kr_role'
   where raw_app_meta_data ->> 'kr_role' = 'super_admin' and id <> uid;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"kr_role":"super_admin"}'::jsonb where id = uid;
  insert into public.kr_settings (id) values (1) on conflict (id) do nothing;
  update public.kr_settings set super_admin_email = lower(btrim(p_email)), updated_at = now() where id = 1;
  -- An admin, and the owner (an admin nobody granted).
  insert into public.staff_roles (user_id, role) values (uid, 'ADMIN') on conflict do nothing;
  update public.staff_roles set granted_by = null where user_id = uid and role = 'ADMIN';
  insert into public.audit_log (actor, actor_email, action, target, after, reason)
  values (null, 'SQL Editor', 'set_super_admin', lower(btrim(p_email)), jsonb_build_object('super_admin', lower(btrim(p_email))), 'set by SQL');
  return 'Done: ' || lower(btrim(p_email)) || ' is the only Super Admin. Sign out and in again on the site.';
end $$;
revoke all on function public.kr_set_super_admin(text) from public, anon, authenticated;

-- ── Only the owner gives Admin (no admin makes another admin any more) ──
create or replace function public.kr_grant_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  if p_role not in ('ADMIN', 'EXPERT', 'DEALER', 'REPORTER') then raise exception 'Unknown role'; end if;
  if p_role = 'ADMIN' and not public.kr_is_owner() then raise exception 'Only the Super Admin can give Admin access' using errcode = '42501'; end if;
  insert into public.staff_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid())
  on conflict do nothing;
  update public.role_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where user_id = p_user and role = p_role;
  if public.kr_is_super_admin() then perform public.kr_audit('grant_role', p_user::text, null, jsonb_build_object('role', p_role), null); end if;
end $$;

-- ── Super Admin: the overview ──
create or replace function public.kr_super_overview() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare
  out jsonb;
  n bigint;
  t text;
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can see this.' using errcode = '42501'; end if;
  out := jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'accounts_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'signed_in_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'suspended', (select count(*) from auth.users where banned_until > now()),
    'admins', (select count(distinct user_id) from public.staff_roles where role = 'ADMIN'),
    'two_step', (select count(distinct user_id) from auth.mfa_factors where status = 'verified'),
    'help_open', (select count(*) from public.support_requests where status in ('open', 'in_progress')));
  -- Every other table that exists here, by its row count.
  foreach t in array array['market_listings', 'market_orders', 'rental_listings', 'rental_bookings', 'cold_slot_bookings', 'identity_checks', 'consignments', 'advisory_requests'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      out := out || jsonb_build_object(t, n);
    end if;
  end loop;
  return out;
end $$;
revoke all on function public.kr_super_overview() from public, anon;
grant execute on function public.kr_super_overview() to authenticated;

-- ── Super Admin: the people ──
create or replace function public.kr_super_people(p_search text, p_limit integer) returns table (
  id uuid, email text, phone text, created_at timestamptz, last_sign_in_at timestamptz,
  portals jsonb, staff text[], two_step boolean, identity text, suspended boolean, suspended_reason text
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can see this.' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, u.phone::text, u.created_at, u.last_sign_in_at,
         coalesce(u.raw_user_meta_data -> 'portals', u.raw_user_meta_data -> 'roles', '[]'::jsonb),
         coalesce((select array_agg(r.role order by r.role) from public.staff_roles r where r.user_id = u.id), '{}'),
         exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
         -- The identity check's state only — never a number.
         case when to_regclass('public.identity_checks') is null then null
              else (select 'checked' where exists (select 1 from public.identity_checks c where c.user_id = u.id)) end,
         coalesce(u.banned_until > now(), false),
         (select s.reason from public.account_suspensions s where s.user_id = u.id and s.lifted_at is null order by s.at desc limit 1)
    from auth.users u
   where coalesce(btrim(p_search), '') = ''
      or u.email ilike '%' || btrim(p_search) || '%'
      or u.phone ilike '%' || btrim(p_search) || '%'
   order by u.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 500);
end $$;
revoke all on function public.kr_super_people(text, integer) from public, anon;
grant execute on function public.kr_super_people(text, integer) to authenticated;

-- ── Super Admin: suspend / re-enable ──
create table if not exists public.account_suspensions (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  reason    text not null check (char_length(reason) between 3 and 500),
  by_user   uuid,
  at        timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid
);
create index if not exists account_suspensions_user on public.account_suspensions (user_id, at desc);
alter table public.account_suspensions enable row level security;
revoke all on public.account_suspensions from anon, authenticated;
grant select on public.account_suspensions to authenticated;
drop policy if exists "Own suspensions, Super Admin all" on public.account_suspensions;
create policy "Own suspensions, Super Admin all" on public.account_suspensions for select to authenticated
  using (user_id = auth.uid() or public.kr_is_super_admin());

create or replace function public.kr_super_suspend(p_user uuid, p_reason text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare before_ban timestamptz;
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can do this.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot suspend yourself.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Write the reason (the account owner sees it).'; end if;
  select banned_until into before_ban from auth.users where id = p_user;
  if not found then return 'No such account.'; end if;
  update auth.users set banned_until = 'infinity' where id = p_user;
  delete from auth.sessions where user_id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
  insert into public.account_suspensions (user_id, reason, by_user) values (p_user, btrim(p_reason), auth.uid());
  perform public.kr_audit('suspend', p_user::text, jsonb_build_object('banned_until', before_ban), jsonb_build_object('banned_until', 'infinity'), btrim(p_reason));
  return 'suspended';
end $$;
revoke all on function public.kr_super_suspend(uuid, text) from public, anon;
grant execute on function public.kr_super_suspend(uuid, text) to authenticated;

create or replace function public.kr_super_reenable(p_user uuid, p_reason text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare before_ban timestamptz;
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can do this.' using errcode = '42501'; end if;
  select banned_until into before_ban from auth.users where id = p_user;
  if not found then return 'No such account.'; end if;
  update auth.users set banned_until = null where id = p_user;
  update public.account_suspensions set lifted_at = now(), lifted_by = auth.uid() where user_id = p_user and lifted_at is null;
  perform public.kr_audit('reenable', p_user::text, jsonb_build_object('banned_until', before_ban), jsonb_build_object('banned_until', null), nullif(btrim(coalesce(p_reason, '')), ''));
  return 're-enabled';
end $$;
revoke all on function public.kr_super_reenable(uuid, text) from public, anon;
grant execute on function public.kr_super_reenable(uuid, text) to authenticated;

-- ── Super Admin: give / take Admin ──
create or replace function public.kr_super_set_admin(p_user uuid, p_admin boolean, p_reason text) returns text
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can do this.' using errcode = '42501'; end if;
  if p_user = auth.uid() and not p_admin then raise exception 'You cannot remove your own Admin access.'; end if;
  if p_admin then
    insert into public.staff_roles (user_id, role, granted_by) values (p_user, 'ADMIN', auth.uid()) on conflict do nothing;
  else
    delete from public.staff_roles where user_id = p_user and role = 'ADMIN';
  end if;
  perform public.kr_audit(case when p_admin then 'give_admin' else 'take_admin' end, p_user::text, jsonb_build_object('admin', not p_admin), jsonb_build_object('admin', p_admin), nullif(btrim(coalesce(p_reason, '')), ''));
  return case when p_admin then 'admin' else 'not admin' end;
end $$;
revoke all on function public.kr_super_set_admin(uuid, boolean, text) from public, anon;
grant execute on function public.kr_super_set_admin(uuid, boolean, text) to authenticated;

-- ── Super Admin: an export is noted (the file itself is made in the browser) ──
create or replace function public.kr_super_note_export(p_what text, p_rows integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can do this.' using errcode = '42501'; end if;
  perform public.kr_audit('export', left(p_what, 200), null, jsonb_build_object('rows', p_rows), null);
end $$;
revoke all on function public.kr_super_note_export(text, integer) from public, anon;
grant execute on function public.kr_super_note_export(text, integer) to authenticated;

notify pgrst, 'reload schema';
