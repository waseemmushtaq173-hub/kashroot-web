-- KashRoot: the admin team.
-- The owner (the admin made in the SQL Editor with kr_make_admin) can give
-- Admin access to a partner by their account email, and take it away. Partners
-- can use the Admin portal but cannot add or remove admins, so nobody can
-- lock the owner out. Each admin chooses their own admin code the first time
-- they open the portal.
-- Run after 20261014000000_trust_and_security.sql. Safe to run again.

-- The owner: an admin whose role was not given by another admin.
create or replace function public.kr_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.kr_has_role('ADMIN')
     and exists (select 1 from public.staff_roles where user_id = auth.uid() and role = 'ADMIN' and granted_by is null)
$$;
revoke execute on function public.kr_is_owner() from public, anon;
grant execute on function public.kr_is_owner() to authenticated;

-- Approving staff stays with every admin; giving Admin itself is owner-only.
create or replace function public.kr_grant_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  if p_role not in ('ADMIN', 'EXPERT', 'DEALER', 'REPORTER') then raise exception 'Unknown role'; end if;
  if p_role = 'ADMIN' and not public.kr_is_owner() then raise exception 'Only the owner can give Admin access'; end if;
  insert into public.staff_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid())
  on conflict do nothing;
  update public.role_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where user_id = p_user and role = p_role;
end $$;

create or replace function public.kr_revoke_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  if p_user = auth.uid() and p_role = 'ADMIN' then raise exception 'You cannot remove your own admin role'; end if;
  if p_role = 'ADMIN' and not public.kr_is_owner() then raise exception 'Only the owner can remove Admin access'; end if;
  delete from public.staff_roles where user_id = p_user and role = p_role;
  -- A removed admin's code goes too: if they are added again they choose a new one.
  if p_role = 'ADMIN' then delete from public.admin_lock where user_id = p_user; end if;
end $$;

create or replace function public.kr_add_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.kr_is_owner() then raise exception 'Only the owner can give Admin access'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'No KashRoot account with that email. Ask them to create an account first (any portal), then add them again.';
  end if;
  insert into public.staff_roles (user_id, role, granted_by) values (uid, 'ADMIN', auth.uid())
  on conflict do nothing;
  return trim(p_email);
end $$;
revoke execute on function public.kr_add_admin(text) from public, anon;
grant execute on function public.kr_add_admin(text) to authenticated;

create or replace function public.kr_admin_team()
returns table (user_id uuid, email text, full_name text, granted_at timestamptz, has_code boolean, is_me boolean, is_owner boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  return query
    select s.user_id, u.email::text, coalesce(u.raw_user_meta_data ->> 'full_name', '')::text, s.granted_at,
           exists (select 1 from public.admin_lock l where l.user_id = s.user_id),
           s.user_id = auth.uid(),
           s.granted_by is null
      from public.staff_roles s join auth.users u on u.id = s.user_id
     where s.role = 'ADMIN'
     order by s.granted_at;
end $$;
revoke execute on function public.kr_admin_team() from public, anon;
grant execute on function public.kr_admin_team() to authenticated;
