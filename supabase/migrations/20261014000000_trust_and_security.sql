-- KashRoot: admin lock, identity checks (KYC) before money moves, and fake
-- fertiliser reports without an account.
--
-- Run after 20261013000000_contributors.sql. Safe to run again.
--
--   1. Admin lock. Being an admin is not enough to open the Admin portal:
--      each sign-in must also enter the admin's own access code (6–32
--      characters). Five wrong codes block it for 15 minutes. The database
--      itself refuses admin actions until the code is entered, so hiding the
--      portal is not the only protection.
--   2. KYC before money. Selling, ordering, booking cold storage, listing a
--      store and adding UPI / bank details need a verified Aadhaar (and PAN,
--      when PAN checking is switched on). Verification is recorded only by
--      the KashRoot server, which proves itself with a secret (see
--      kr_kyc_secret below) — a user cannot mark themselves verified.
--   3. Anyone can report a suspicious fertiliser batch, signed in or not.
--      The public count shown to farmers counts only signed-in reporters, so
--      anonymous reports cannot be used to smear a genuine batch.

-- ───────────────────────── 1. admin lock ─────────────────────────
create table if not exists public.admin_lock (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  salt         text not null,
  code_hash    text not null,
  failed       int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
create table if not exists public.admin_unlocks (
  session_id text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.admin_lock enable row level security;
alter table public.admin_unlocks enable row level security;
-- No policies: only the functions below (running as the owner) touch these.
revoke all on public.admin_lock, public.admin_unlocks from anon, authenticated;

-- Slow, salted hash of the code (5,000 rounds of SHA-256).
create or replace function public.kr_hash_code(p_salt text, p_code text) returns text
language plpgsql immutable set search_path = public as $$
declare h bytea := convert_to(p_salt || ':' || p_code, 'UTF8');
begin
  for i in 1..5000 loop
    h := sha256(h || convert_to(p_salt, 'UTF8'));
  end loop;
  return encode(h, 'hex');
end $$;
revoke execute on function public.kr_hash_code(text, text) from public, anon, authenticated;

create or replace function public.kr_is_admin_account() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_roles where user_id = auth.uid() and role = 'ADMIN')
$$;

create or replace function public.kr_session_id() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'session_id', '')
$$;

-- No code set yet → not locked (the Admin portal asks for one straight away).
create or replace function public.kr_admin_unlocked() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.admin_lock where user_id = auth.uid())
      or exists (
        select 1 from public.admin_unlocks u
         where u.user_id = auth.uid() and u.session_id = public.kr_session_id() and u.expires_at > now()
      )
$$;

-- Every admin check in KashRoot goes through here, so the lock covers them all.
create or replace function public.kr_has_role(wanted text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_roles where user_id = auth.uid() and role = wanted)
     and (wanted <> 'ADMIN' or public.kr_admin_unlocked())
$$;

-- 'not_admin' | 'no_code' | 'blocked' | 'locked' | 'unlocked'
create or replace function public.kr_admin_status() returns text
language plpgsql stable security definer set search_path = public as $$
declare l public.admin_lock;
begin
  if not public.kr_is_admin_account() then return 'not_admin'; end if;
  select * into l from public.admin_lock where user_id = auth.uid();
  if not found then return 'no_code'; end if;
  if l.locked_until is not null and l.locked_until > now() then return 'blocked'; end if;
  if public.kr_admin_unlocked() then return 'unlocked'; end if;
  return 'locked';
end $$;

-- First time: set the code. Later: change it (needs the current code too).
create or replace function public.kr_admin_set_code(p_new text, p_old text default null) returns void
language plpgsql security definer set search_path = public as $$
declare l public.admin_lock; s text;
begin
  if not public.kr_is_admin_account() then raise exception 'Only an admin can do this'; end if;
  if public.kr_session_id() is null then raise exception 'Sign in again'; end if;
  if p_new is null or char_length(p_new) < 6 or char_length(p_new) > 32 or p_new !~ '^[A-Za-z0-9@#$%&*!?._-]+$' then
    raise exception 'The admin code must be 6 to 32 letters, numbers or symbols';
  end if;
  select * into l from public.admin_lock where user_id = auth.uid();
  if found then
    if not public.kr_admin_unlocked() or p_old is null or public.kr_hash_code(l.salt, p_old) <> l.code_hash then
      raise exception 'Enter your current admin code to change it';
    end if;
  end if;
  s := replace(gen_random_uuid()::text, '-', '');
  insert into public.admin_lock (user_id, salt, code_hash, failed, locked_until, updated_at)
  values (auth.uid(), s, public.kr_hash_code(s, p_new), 0, null, now())
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
  if p_code is null or public.kr_hash_code(l.salt, p_code) <> l.code_hash then
    update public.admin_lock
       set failed = case when failed + 1 >= 5 then 0 else failed + 1 end,
           locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else locked_until end
     where user_id = auth.uid();
    return case when l.failed + 1 >= 5 then 'blocked' else 'wrong' end;
  end if;
  update public.admin_lock set failed = 0, locked_until = null where user_id = auth.uid();
  delete from public.admin_unlocks where expires_at < now();
  insert into public.admin_unlocks (session_id, user_id, expires_at) values (public.kr_session_id(), auth.uid(), now() + interval '12 hours')
  on conflict (session_id) do update set user_id = excluded.user_id, expires_at = excluded.expires_at;
  return 'unlocked';
end $$;

-- Lock again now (e.g. when leaving a shared computer).
create or replace function public.kr_admin_lock_now() returns void
language sql security definer set search_path = public as $$
  delete from public.admin_unlocks where user_id = auth.uid() and session_id = public.kr_session_id()
$$;

-- Forgot the code? Run from the SQL Editor only: select public.kr_admin_reset_code('you@example.com');
create or replace function public.kr_admin_reset_code(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then return 'No account with that email.'; end if;
  delete from public.admin_lock where user_id = uid;
  delete from public.admin_unlocks where user_id = uid;
  return 'Admin code removed. Sign in to the Admin portal to set a new one.';
end $$;
revoke execute on function public.kr_admin_reset_code(text) from public, anon, authenticated;

grant execute on function public.kr_admin_status(), public.kr_admin_set_code(text, text), public.kr_admin_unlock(text), public.kr_admin_lock_now() to authenticated;

-- ───────────────────────── 2. KYC before money ─────────────────────────
-- The table was first called kyc_status; that name clashes with an older
-- database type of the same name (kept by the earlier KashRoot backend), so it
-- is identity_checks now. A project that already has the table gets it renamed.
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'kyc_status' and c.relkind = 'r')
     and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'identity_checks') then
    alter table public.kyc_status rename to identity_checks;
  end if;
end $$;

create table if not exists public.identity_checks (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  aadhaar_last4       text check (aadhaar_last4 ~ '^[0-9]{4}$'),
  aadhaar_name        text check (char_length(aadhaar_name) <= 120),
  aadhaar_method      text check (char_length(aadhaar_method) <= 40),
  aadhaar_verified_at timestamptz,
  pan_last4           text check (pan_last4 ~ '^[A-Z0-9]{4}$'),
  pan_name            text check (char_length(pan_name) <= 120),
  pan_verified_at     timestamptz,
  updated_at          timestamptz not null default now()
);
alter table public.identity_checks enable row level security;
drop policy if exists "Own KYC, admins all" on public.identity_checks;
create policy "Own KYC, admins all" on public.identity_checks for select to authenticated
  using (user_id = auth.uid() or public.kr_has_role('ADMIN'));
grant select on public.identity_checks to authenticated;

create table if not exists public.kr_settings (
  id           int primary key default 1 check (id = 1),
  kyc_required boolean not null default false,
  pan_required boolean not null default false,
  kyc_secret   text,
  updated_at   timestamptz not null default now()
);
insert into public.kr_settings (id) values (1) on conflict do nothing;
alter table public.kr_settings enable row level security;
revoke all on public.kr_settings from anon, authenticated;

-- Run from the SQL Editor only: select public.kr_kyc_secret();
-- It returns a long random text; paste it into Vercel as KYC_DB_SECRET.
create or replace function public.kr_kyc_secret() returns text
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  update public.kr_settings
     set kyc_secret = coalesce(kyc_secret, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
         updated_at = now()
   where id = 1
  returning kyc_secret into s;
  return s;
end $$;
revoke execute on function public.kr_kyc_secret() from public, anon, authenticated;

-- Called by the KashRoot server (with the signed-in user's token) after it has
-- checked an Aadhaar or PAN. Without the secret it does nothing.
create or replace function public.kr_record_kyc(p_secret text, p_kind text, p_last4 text, p_name text, p_method text) returns boolean
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if auth.uid() is null then return false; end if;
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then return false; end if;
  if p_kind = 'aadhaar' then
    insert into public.identity_checks (user_id, aadhaar_last4, aadhaar_name, aadhaar_method, aadhaar_verified_at, updated_at)
    values (auth.uid(), nullif(p_last4, ''), left(nullif(trim(p_name), ''), 120), left(p_method, 40), now(), now())
    on conflict (user_id) do update set aadhaar_last4 = coalesce(excluded.aadhaar_last4, public.identity_checks.aadhaar_last4),
      aadhaar_name = coalesce(excluded.aadhaar_name, public.identity_checks.aadhaar_name), aadhaar_method = excluded.aadhaar_method,
      aadhaar_verified_at = now(), updated_at = now();
  elsif p_kind = 'pan' then
    insert into public.identity_checks (user_id, pan_last4, pan_name, pan_verified_at, updated_at)
    values (auth.uid(), nullif(upper(p_last4), ''), left(nullif(trim(p_name), ''), 120), now(), now())
    on conflict (user_id) do update set pan_last4 = coalesce(excluded.pan_last4, public.identity_checks.pan_last4),
      pan_name = coalesce(excluded.pan_name, public.identity_checks.pan_name), pan_verified_at = now(), updated_at = now();
  else
    return false;
  end if;
  return true;
end $$;
grant execute on function public.kr_record_kyc(text, text, text, text, text) to authenticated;

-- What is required, and whether the server can record checks (no secrets returned).
create or replace function public.kr_kyc_rules() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('kyc_required', kyc_required, 'pan_required', pan_required, 'recording', kyc_secret is not null)
  from public.kr_settings where id = 1
$$;
grant execute on function public.kr_kyc_rules() to anon, authenticated;

create or replace function public.kr_set_kyc_rules(p_required boolean, p_pan boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  if p_required and (select kyc_secret is null from public.kr_settings where id = 1) then
    raise exception 'Set up KYC recording first (KYC_DB_SECRET), or nobody could pass the check';
  end if;
  update public.kr_settings set kyc_required = p_required, pan_required = p_pan, updated_at = now() where id = 1;
end $$;
grant execute on function public.kr_set_kyc_rules(boolean, boolean) to authenticated;

-- Has this account done the KYC that money actions need?
create or replace function public.kr_kyc_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select not s.kyc_required
      or exists (
        select 1 from public.identity_checks k
         where k.user_id = auth.uid() and k.aadhaar_verified_at is not null
           and (not s.pan_required or k.pan_verified_at is not null)
      )
  from public.kr_settings s where s.id = 1
$$;
grant execute on function public.kr_kyc_ok() to authenticated;

-- Restrictive policies: these are added to (ANDed with) the existing rules.
drop policy if exists "KYC before selling" on public.market_listings;
create policy "KYC before selling" on public.market_listings as restrictive for insert to authenticated with check (public.kr_kyc_ok());
drop policy if exists "KYC before ordering" on public.market_orders;
create policy "KYC before ordering" on public.market_orders as restrictive for insert to authenticated with check (public.kr_kyc_ok());
drop policy if exists "KYC before listing a store" on public.rental_listings;
create policy "KYC before listing a store" on public.rental_listings as restrictive for insert to authenticated with check (public.kr_kyc_ok());
drop policy if exists "KYC before booking" on public.rental_bookings;
create policy "KYC before booking" on public.rental_bookings as restrictive for insert to authenticated with check (public.kr_kyc_ok());
drop policy if exists "KYC before adding payout details" on public.payout_accounts;
create policy "KYC before adding payout details" on public.payout_accounts as restrictive for insert to authenticated with check (public.kr_kyc_ok());
drop policy if exists "KYC before changing payout details" on public.payout_accounts;
create policy "KYC before changing payout details" on public.payout_accounts as restrictive for update to authenticated using (true) with check (public.kr_kyc_ok());

-- ───────────────────────── 3. fake-batch reports without an account ─────────────────────────
alter table public.batch_reports alter column reporter_id drop not null;
alter table public.batch_reports add column if not exists phone text check (phone is null or phone ~ '^[0-9]{10}$');

create or replace function public.kr_report_batch(p_code text, p_note text, p_phone text default null) returns void
language plpgsql security definer set search_path = public as $$
declare code text := upper(trim(p_code)); phone text := nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), '');
begin
  if code is null or char_length(code) not between 1 and 40 then raise exception 'Write the batch number'; end if;
  if p_note is null or char_length(trim(p_note)) < 3 then raise exception 'Say what looked wrong'; end if;
  if phone is not null and char_length(phone) <> 10 then phone := null; end if;
  if auth.uid() is null then
    -- Anonymous: a few per batch per day, and a daily ceiling overall.
    if (select count(*) from public.batch_reports where reporter_id is null and batch_code = code and created_at > now() - interval '1 day') >= 5
       or (select count(*) from public.batch_reports where reporter_id is null and created_at > now() - interval '1 day') >= 300 then
      raise exception 'Many reports were already sent today. Please tell your district agriculture officer as well.';
    end if;
  elsif exists (select 1 from public.batch_reports where reporter_id = auth.uid() and batch_code = code and created_at > now() - interval '1 day') then
    return; -- already reported today
  end if;
  insert into public.batch_reports (batch_code, reporter_id, note, phone)
  values (code, auth.uid(), left(trim(p_note), 500), phone);
end $$;
grant execute on function public.kr_report_batch(text, text, text) to anon, authenticated;

-- The public count shows signed-in farmers only (anonymous reports go to the admin).
create or replace function public.kr_check_batch(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(b) - 'registered_by' || jsonb_build_object(
    'dealer_verified',
      exists (select 1 from public.staff_roles s where s.user_id = b.registered_by and s.role in ('DEALER', 'ADMIN'))
      or exists (select 1 from auth.users u where u.id = b.registered_by and u.raw_app_meta_data ->> 'role' in ('DEALER', 'MANUFACTURER', 'ADMIN')),
    'reports', (select count(distinct r.reporter_id) from public.batch_reports r where r.batch_code = b.batch_code and r.reporter_id is not null)
  )
  from public.fertilizer_batches b where b.batch_code = upper(trim(p_code))
$$;
