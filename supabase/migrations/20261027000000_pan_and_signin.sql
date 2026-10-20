-- KashRoot: a PAN counts as verified only when its number was really read.
-- Before this, a DigiLocker sign-in where the person only ALLOWED sharing a
-- PAN (without having one in DigiLocker) recorded "PAN verified" with no PAN
-- number, and Admin → Accounts showed "PAN ✓" for people with no PAN card.
--   1. kr_record_kyc refuses a PAN without the last four characters of the
--      PAN number (read from the Income Tax record or the DigiLocker PAN card).
--   2. Those wrong records are cleared (the PAN part only; Aadhaar stays).
--   3. The table itself refuses "PAN verified" without the last four.
--   4. Admin → Accounts counts PAN only with its last four, and shows the
--      last four of the PAN and the Aadhaar so an admin can check them.
-- (The sign-in time limits of this change live in the browser: no SQL.)
-- Run after 20261018000000_accounts_last_active.sql. Safe to run again.

-- ───────────────────────── 1. recording a check ─────────────────────────
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
    -- No PAN number read, no PAN: allowing PAN on a consent screen is not having one.
    if coalesce(upper(trim(p_last4)), '') !~ '^[A-Z0-9]{4}$' then return false; end if;
    insert into public.identity_checks (user_id, pan_last4, pan_name, pan_verified_at, updated_at)
    values (auth.uid(), upper(trim(p_last4)), left(nullif(trim(p_name), ''), 120), now(), now())
    on conflict (user_id) do update set pan_last4 = excluded.pan_last4,
      pan_name = coalesce(excluded.pan_name, public.identity_checks.pan_name), pan_verified_at = now(), updated_at = now();
  else
    return false;
  end if;
  return true;
end $$;
revoke execute on function public.kr_record_kyc(text, text, text, text, text) from public, anon;
grant execute on function public.kr_record_kyc(text, text, text, text, text) to authenticated;

-- ───────────────────────── 2. clear the wrong records ─────────────────────────
update public.identity_checks
   set pan_verified_at = null, pan_name = null, updated_at = now()
 where pan_verified_at is not null and pan_last4 is null;

-- ───────────────────────── 3. the table refuses it too ─────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'identity_checks_pan_needs_last4' and conrelid = 'public.identity_checks'::regclass) then
    alter table public.identity_checks
      add constraint identity_checks_pan_needs_last4 check (pan_verified_at is null or pan_last4 is not null);
  end if;
end $$;

-- ───────────────────────── 4. Admin → Accounts ─────────────────────────
-- Dropped first: the answer has two more columns, and Postgres cannot change it in place.
drop function if exists public.kr_admin_accounts();
create function public.kr_admin_accounts()
returns table (
  user_id uuid, email text, full_name text, phone text, roles text[], portals text[], staff text[],
  district text, joined_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  aadhaar_verified boolean, pan_verified boolean, last_active_at timestamptz,
  aadhaar_last4 text, pan_last4 text
)
language plpgsql stable security definer set search_path = public, auth as $$
declare
  seen jsonb := '{}'::jsonb;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only KashRoot admins can see this'; end if;
  -- Newest token renewal per person. If this Supabase version keeps them
  -- differently, the list still loads and uses the last sign-in instead.
  begin
    select coalesce(jsonb_object_agg(t.user_id, t.at), '{}'::jsonb) into seen
      from (select r.user_id::text as user_id, max(greatest(r.created_at, r.updated_at)) as at
              from auth.refresh_tokens r where r.user_id is not null group by r.user_id) t;
  exception when others then
    seen := '{}'::jsonb;
  end;
  return query
    select
      a.id, a.email, a.full_name, a.phone, a.roles, a.portals, a.staff, a.district, a.joined_at,
      a.last_sign_in_at, a.email_confirmed,
      a.aadhaar_at is not null,
      -- A PAN counts only with the last four characters of its number.
      a.pan_at is not null and a.pan4 is not null,
      greatest(a.last_sign_in_at, a.renewed),
      case when a.aadhaar_at is not null then a.aadhaar4 end,
      case when a.pan_at is not null then a.pan4 end
    from (
      select
        u.id,
        u.email::text as email,
        coalesce(u.raw_user_meta_data ->> 'full_name', '')::text as full_name,
        coalesce(nullif(u.raw_user_meta_data ->> 'phone', ''), nullif(u.phone::text, ''), '')::text as phone,
        -- The kind of account chosen at sign-up (FARMER, BUYER, SELLER, PROVIDER…).
        coalesce((select array_agg(distinct r) from jsonb_array_elements_text(
          case when jsonb_typeof(u.raw_user_meta_data -> 'roles') = 'array' then u.raw_user_meta_data -> 'roles'
               else jsonb_build_array(coalesce(u.raw_user_meta_data ->> 'role', 'FARMER')) end) r), '{}')::text[] as roles,
        -- Portals where they filled in "My details" (profile_farmer, profile_seller…).
        coalesce((select array_agg(substr(k, 9) order by k) from jsonb_object_keys(coalesce(u.raw_user_meta_data, '{}'::jsonb)) k where k like 'profile\_%'), '{}')::text[] as portals,
        coalesce((select array_agg(s.role order by s.role) from public.staff_roles s where s.user_id = u.id), '{}')::text[] as staff,
        coalesce((select v ->> 'district' from jsonb_each(coalesce(u.raw_user_meta_data, '{}'::jsonb)) e(k, v)
                   where k like 'profile\_%' and jsonb_typeof(v) = 'object' and coalesce(v ->> 'district', '') <> '' limit 1), '')::text as district,
        u.created_at as joined_at,
        u.last_sign_in_at,
        u.email_confirmed_at is not null as email_confirmed,
        k.aadhaar_verified_at as aadhaar_at,
        k.aadhaar_last4::text as aadhaar4,
        k.pan_verified_at as pan_at,
        k.pan_last4::text as pan4,
        (seen ->> u.id::text)::timestamptz as renewed
      from auth.users u
      left join public.identity_checks k on k.user_id = u.id
    ) a
    order by coalesce(greatest(a.last_sign_in_at, a.renewed), a.joined_at) desc
    limit 2000;
end $$;
revoke execute on function public.kr_admin_accounts() from public, anon;
grant execute on function public.kr_admin_accounts() to authenticated;
