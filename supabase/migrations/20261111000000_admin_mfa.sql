-- KashRoot: two-step sign-in (an authenticator app — Google Authenticator,
-- Microsoft Authenticator, Authy — Supabase Auth MFA, TOTP) REQUIRED for
-- admins, in the database itself:
--   * kr_has_role('ADMIN') — every admin check and admin-only row policy in
--     KashRoot goes through it — now also needs this session to have passed
--     the authenticator (the sign-in token says aal2). A stolen password, or
--     a stolen session that never passed it, opens nothing.
--   * kr_admin_status() says 'mfa_setup' (no authenticator yet) or
--     'mfa_verify' (has one; this session has not used it) before the access
--     code, so the Admin portal leads the admin through it — setting one up
--     needs only a normal sign-in, so no admin is locked out.
--   * kr_admin_unlock (the access code) also needs aal2.
-- SMS is never a second factor for admins. Lost phone: until the Super Admin
-- console exists, the owner removes the factor in Supabase (Authentication →
-- Users → the user → Multi-factor) or with SQL.
-- Run after 20261110000000_signin_lockout.sql. Safe to run again.

-- This session passed two-step sign-in.
create or replace function public.kr_aal2() returns boolean
language sql stable set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;
grant execute on function public.kr_aal2() to anon, authenticated;

-- The signed-in account has a verified authenticator.
create or replace function public.kr_has_mfa() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;
revoke all on function public.kr_has_mfa() from public, anon;
grant execute on function public.kr_has_mfa() to authenticated;

-- Every admin check in KashRoot goes through here: admin role, the access code, and now two-step sign-in.
create or replace function public.kr_has_role(wanted text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_roles where user_id = auth.uid() and role = wanted)
     and (wanted <> 'ADMIN' or (public.kr_aal2() and public.kr_admin_unlocked()))
$$;

-- 'not_admin' | 'mfa_setup' | 'mfa_verify' | 'no_code' | 'blocked' | 'locked' | 'unlocked'
create or replace function public.kr_admin_status() returns text
language plpgsql stable security definer set search_path = public as $$
declare l public.admin_lock;
begin
  if not public.kr_is_admin_account() then return 'not_admin'; end if;
  if not public.kr_has_mfa() then return 'mfa_setup'; end if;
  if not public.kr_aal2() then return 'mfa_verify'; end if;
  select * into l from public.admin_lock where user_id = auth.uid();
  if not found then return 'no_code'; end if;
  if l.locked_until is not null and l.locked_until > now() then return 'blocked'; end if;
  if public.kr_admin_unlocked() then return 'unlocked'; end if;
  return 'locked';
end $$;

-- The access code is entered only in a session that passed two-step sign-in
-- (20261104000000_admin_code_bcrypt.sql's kr_admin_unlock, with that one check added).
create or replace function public.kr_admin_unlock(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare l public.admin_lock;
begin
  if not public.kr_is_admin_account() then raise exception 'Only an admin can do this'; end if;
  if not public.kr_aal2() then raise exception 'Use your authenticator app first (two-step sign-in).' using errcode = '42501'; end if;
  if public.kr_session_id() is null then raise exception 'Sign in again'; end if;
  select * into l from public.admin_lock where user_id = auth.uid() for update;
  if not found then return 'no_code'; end if;
  if l.locked_until is not null and l.locked_until > now() then return 'blocked'; end if;
  if not public.kr_code_matches(l, p_code) then
    update public.admin_lock
       set failed = case when failed + 1 >= 5 then 0 else failed + 1 end,
           locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else locked_until end
     where user_id = auth.uid();
    return case when l.failed + 1 >= 5 then 'blocked' else 'wrong' end;
  end if;
  -- The right code: an older SHA-256 one is kept with bcrypt from now on.
  update public.admin_lock
     set failed = 0, locked_until = null,
         salt = case when code_hash like '$2%' then salt else 'bcrypt' end,
         code_hash = case when code_hash like '$2%' then code_hash else public.kr_code_bcrypt(p_code) end
   where user_id = auth.uid();
  delete from public.admin_unlocks where expires_at < now();
  insert into public.admin_unlocks (session_id, user_id, expires_at) values (public.kr_session_id(), auth.uid(), now() + interval '12 hours')
  on conflict (session_id) do update set user_id = excluded.user_id, expires_at = excluded.expires_at;
  return 'unlocked';
end $$;

notify pgrst, 'reload schema';
