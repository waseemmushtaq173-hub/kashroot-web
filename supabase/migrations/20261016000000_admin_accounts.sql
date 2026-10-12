-- KashRoot: the list of accounts for the Admin portal (Admin → Accounts).
-- Who signed up, for which portal, when they joined and last signed in,
-- whether the email is confirmed and the identity checked. Admins only
-- (signed in, with the admin code entered). Passwords are never read.
-- Run after 20261015000000_admin_team.sql. Safe to run again.

create or replace function public.kr_admin_accounts()
returns table (
  user_id uuid, email text, full_name text, phone text, roles text[], portals text[], staff text[],
  district text, joined_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  aadhaar_verified boolean, pan_verified boolean
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only KashRoot admins can see this'; end if;
  return query
    select
      u.id,
      u.email::text,
      coalesce(u.raw_user_meta_data ->> 'full_name', '')::text,
      coalesce(nullif(u.raw_user_meta_data ->> 'phone', ''), nullif(u.phone::text, ''), '')::text,
      -- The kind of account chosen at sign-up (FARMER, BUYER, SELLER, PROVIDER…).
      coalesce((select array_agg(distinct r) from jsonb_array_elements_text(
        case when jsonb_typeof(u.raw_user_meta_data -> 'roles') = 'array' then u.raw_user_meta_data -> 'roles'
             else jsonb_build_array(coalesce(u.raw_user_meta_data ->> 'role', 'FARMER')) end) r), '{}')::text[],
      -- Portals where they filled in "My details" (profile_farmer, profile_seller…).
      coalesce((select array_agg(substr(k, 9) order by k) from jsonb_object_keys(coalesce(u.raw_user_meta_data, '{}'::jsonb)) k where k like 'profile\_%'), '{}')::text[],
      coalesce((select array_agg(s.role order by s.role) from public.staff_roles s where s.user_id = u.id), '{}')::text[],
      coalesce((select v ->> 'district' from jsonb_each(coalesce(u.raw_user_meta_data, '{}'::jsonb)) e(k, v)
                 where k like 'profile\_%' and jsonb_typeof(v) = 'object' and coalesce(v ->> 'district', '') <> '' limit 1), '')::text,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at is not null,
      exists (select 1 from public.kyc_status k where k.user_id = u.id and k.aadhaar_verified_at is not null),
      exists (select 1 from public.kyc_status k where k.user_id = u.id and k.pan_verified_at is not null)
    from auth.users u
    order by coalesce(u.last_sign_in_at, u.created_at) desc
    limit 2000;
end $$;
revoke execute on function public.kr_admin_accounts() from public, anon;
grant execute on function public.kr_admin_accounts() to authenticated;
