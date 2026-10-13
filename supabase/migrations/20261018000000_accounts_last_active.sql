-- KashRoot: Admin → Accounts shows when each person last USED KashRoot.
-- People now stay signed in until they press Sign out, so "last sign-in"
-- stops moving for regular users. Their app renews its sign-in token while
-- they use it (auth.refresh_tokens), so the newest of those is when they
-- were last active. Admins only. Run after 20261016000000_admin_accounts.sql.
-- Safe to run again.

drop function if exists public.kr_admin_accounts();
create function public.kr_admin_accounts()
returns table (
  user_id uuid, email text, full_name text, phone text, roles text[], portals text[], staff text[],
  district text, joined_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  aadhaar_verified boolean, pan_verified boolean, last_active_at timestamptz
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
      a.last_sign_in_at, a.email_confirmed, a.aadhaar_verified, a.pan_verified,
      greatest(a.last_sign_in_at, a.renewed) as last_active_at
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
        exists (select 1 from public.identity_checks k where k.user_id = u.id and k.aadhaar_verified_at is not null) as aadhaar_verified,
        exists (select 1 from public.identity_checks k where k.user_id = u.id and k.pan_verified_at is not null) as pan_verified,
        (seen ->> u.id::text)::timestamptz as renewed
      from auth.users u
    ) a
    order by coalesce(greatest(a.last_sign_in_at, a.renewed), a.joined_at) desc
    limit 2000;
end $$;
revoke execute on function public.kr_admin_accounts() from public, anon;
grant execute on function public.kr_admin_accounts() to authenticated;
