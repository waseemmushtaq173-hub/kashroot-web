-- KashRoot: the admin's own code (Admin portal lock) kept with bcrypt.
-- It was a salted hash of 5,000 rounds of SHA-256: not plain text, and the
-- table is closed to everyone, but SHA-256 is fast to guess offline if the
-- database ever leaked. bcrypt (pgcrypto, cost 11) is built to be slow.
-- (argon2 is not available inside Postgres; the code is checked here.)
--   new and changed codes: bcrypt
--   an existing code: still accepted, and saved again with bcrypt the next
--   time its admin unlocks with it — nobody has to reset their code.
-- The 5-wrong-tries lockout and 12-hour unlock stay as they were.
-- Run after 20261103000000_rate_limits.sql. Safe to run again.

create extension if not exists pgcrypto with schema extensions;

-- Does this code match what is kept? (bcrypt, or the older SHA-256 rounds.)
create or replace function public.kr_code_matches(p_lock public.admin_lock, p_code text) returns boolean
language plpgsql stable set search_path = public, extensions as $$
begin
  if p_code is null or p_lock.code_hash is null then return false; end if;
  if p_lock.code_hash like '$2%' then return crypt(p_code, p_lock.code_hash) = p_lock.code_hash; end if;
  return public.kr_hash_code(p_lock.salt, p_code) = p_lock.code_hash;
end $$;
revoke all on function public.kr_code_matches(public.admin_lock, text) from public, anon, authenticated;

create or replace function public.kr_code_bcrypt(p_code text) returns text
language sql volatile set search_path = public, extensions as $$
  select crypt(p_code, gen_salt('bf', 11))
$$;
revoke all on function public.kr_code_bcrypt(text) from public, anon, authenticated;

-- First time: set the code. Later: change it (needs the current code too).
create or replace function public.kr_admin_set_code(p_new text, p_old text default null) returns void
language plpgsql security definer set search_path = public as $$
declare l public.admin_lock;
begin
  if not public.kr_is_admin_account() then raise exception 'Only an admin can do this'; end if;
  if public.kr_session_id() is null then raise exception 'Sign in again'; end if;
  if p_new is null or char_length(p_new) < 6 or char_length(p_new) > 32 or p_new !~ '^[A-Za-z0-9@#$%&*!?._-]+$' then
    raise exception 'The admin code must be 6 to 32 letters, numbers or symbols';
  end if;
  select * into l from public.admin_lock where user_id = auth.uid();
  if found then
    if not public.kr_admin_unlocked() or not public.kr_code_matches(l, p_old) then
      raise exception 'Enter your current admin code to change it';
    end if;
  end if;
  insert into public.admin_lock (user_id, salt, code_hash, failed, locked_until, updated_at)
  values (auth.uid(), 'bcrypt', public.kr_code_bcrypt(p_new), 0, null, now())
  on conflict (user_id) do update set salt = excluded.salt, code_hash = excluded.code_hash, failed = 0, locked_until = null, updated_at = now();
  insert into public.admin_unlocks (session_id, user_id, expires_at) values (public.kr_session_id(), auth.uid(), now() + interval '12 hours')
  on conflict (session_id) do update set user_id = excluded.user_id, expires_at = excluded.expires_at;
end $$;

-- Enter the code for this sign-in (lasts 12 hours). 'unlocked' | 'wrong' | 'blocked' | 'no_code'
create or replace function public.kr_admin_unlock(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare l public.admin_lock;
begin
  if not public.kr_is_admin_account() then raise exception 'Only an admin can do this'; end if;
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
