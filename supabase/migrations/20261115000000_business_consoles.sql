-- KashRoot: Business Owner consoles, stage 1 — businesses, their people, and their payout details.
--   organisations       a business on KashRoot: a cold store, an agro-dealer, a shop, a mandi helper
--   org_members         who works there: owner, manager or staff (one role per person per business)
--   org_invites         an invitation by email or phone, for 7 days; only that email / phone can accept
--   org_payout_accounts where the business is paid (UPI / bank) — KashRoot never holds the money
-- Rules, in the database:
--   * a business, its people, invites and payout details are seen only by its own members — and by
--     the Super Admin;
--   * the owner adds / removes managers and staff; a manager adds staff; the last owner stays;
--   * payout details: changed only by an OWNER in a session that passed two-step sign-in (aal2);
--     staff never see the account number;
--   * the Super Admin suspends / re-enables a business with a reason its owner sees; a suspended
--     business changes nothing; every Super Admin action is in the audit log.
-- Nobody writes these tables directly: only these functions.
-- Run after 20261114000000_gate_tap.sql. Safe to run again.

create table if not exists public.organisations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 2 and 120),
  kind             text not null check (kind in ('cold_store', 'dealer', 'shop', 'helper')),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  suspended_at     timestamptz,
  suspended_reason text check (suspended_reason is null or char_length(suspended_reason) <= 500)
);

create table if not exists public.org_members (
  org_id   uuid not null references public.organisations (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  role     text not null check (role in ('owner', 'manager', 'staff')),
  added_by uuid,
  added_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user on public.org_members (user_id);

create table if not exists public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  contact     text not null check (char_length(contact) between 5 and 120),
  role        text not null check (role in ('manager', 'staff')),
  invited_by  uuid,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid,
  accepted_at timestamptz
);
create index if not exists org_invites_contact on public.org_invites (lower(contact));

create table if not exists public.org_payout_accounts (
  org_id         uuid primary key references public.organisations (id) on delete cascade,
  account_name   text not null check (char_length(account_name) between 2 and 80),
  upi_id         text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z]{2,64}$'),
  account_number text check (account_number is null or account_number ~ '^[0-9]{6,20}$'),
  ifsc           text check (ifsc is null or ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name      text check (bank_name is null or char_length(bank_name) <= 80),
  updated_by     uuid,
  updated_at     timestamptz not null default now(),
  check (upi_id is not null or (account_number is not null and ifsc is not null))
);

alter table public.organisations enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.org_payout_accounts enable row level security;
revoke all on public.organisations, public.org_members, public.org_invites, public.org_payout_accounts from anon, authenticated;
grant select on public.organisations, public.org_members, public.org_invites to authenticated;

-- The caller's role in a business ('owner' | 'manager' | 'staff'), or null.
create or replace function public.kr_org_role(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.org_members where org_id = p_org and user_id = auth.uid()
$$;
grant execute on function public.kr_org_role(uuid) to authenticated;

drop policy if exists "Members see their business; Super Admin all" on public.organisations;
create policy "Members see their business; Super Admin all" on public.organisations for select to authenticated
  using (public.kr_org_role(id) is not null or public.kr_is_super_admin());
drop policy if exists "Members see their colleagues; Super Admin all" on public.org_members;
create policy "Members see their colleagues; Super Admin all" on public.org_members for select to authenticated
  using (public.kr_org_role(org_id) is not null or public.kr_is_super_admin());
drop policy if exists "Owners and managers see invites; Super Admin all" on public.org_invites;
create policy "Owners and managers see invites; Super Admin all" on public.org_invites for select to authenticated
  using (public.kr_org_role(org_id) in ('owner', 'manager') or public.kr_is_super_admin());

-- A business that is suspended changes nothing.
create or replace function public.kr_org_writable(p_org uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.organisations where id = p_org and suspended_at is not null) then
    raise exception 'This business is suspended by KashRoot: %', coalesce((select suspended_reason from public.organisations where id = p_org), 'see Help & support') using errcode = '42501';
  end if;
end $$;
revoke all on function public.kr_org_writable(uuid) from public, anon, authenticated;

-- Start a business: the caller becomes its owner.
create or replace function public.kr_org_create(p_name text, p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  insert into public.organisations (name, kind, created_by) values (btrim(p_name), p_kind, auth.uid()) returning id into oid;
  insert into public.org_members (org_id, user_id, role, added_by) values (oid, auth.uid(), 'owner', auth.uid());
  return oid;
end $$;
revoke all on function public.kr_org_create(text, text) from public, anon;
grant execute on function public.kr_org_create(text, text) to authenticated;

-- Invite by email or phone: the owner invites managers or staff; a manager invites staff.
create or replace function public.kr_org_invite(p_org uuid, p_contact text, p_role text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me text := public.kr_org_role(p_org); iid uuid;
begin
  perform public.kr_org_writable(p_org);
  if me is null or me = 'staff' then raise exception 'Only the owner or a manager can invite.' using errcode = '42501'; end if;
  if p_role not in ('manager', 'staff') then raise exception 'Invite as manager or staff.'; end if;
  if me = 'manager' and p_role <> 'staff' then raise exception 'A manager can invite staff only.' using errcode = '42501'; end if;
  insert into public.org_invites (org_id, contact, role, invited_by) values (p_org, lower(btrim(p_contact)), p_role, auth.uid()) returning id into iid;
  return iid;
end $$;
revoke all on function public.kr_org_invite(uuid, text, text) from public, anon;
grant execute on function public.kr_org_invite(uuid, text, text) to authenticated;

-- Accept an invitation: only the account with that email or phone, before it runs out, once.
create or replace function public.kr_org_accept(p_invite uuid) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare i public.org_invites; me_email text; me_phone text;
begin
  select lower(coalesce(email, '')), regexp_replace(coalesce(phone, ''), '\D', '', 'g') into me_email, me_phone from auth.users where id = auth.uid();
  select * into i from public.org_invites where id = p_invite for update;
  if not found or i.accepted_at is not null or i.expires_at < now() then raise exception 'This invitation is not valid any more.'; end if;
  if not (i.contact = me_email or right(regexp_replace(i.contact, '\D', '', 'g'), 10) = right(me_phone, 10) and length(me_phone) >= 10) then
    raise exception 'This invitation is for another email or phone.' using errcode = '42501';
  end if;
  perform public.kr_org_writable(i.org_id);
  insert into public.org_members (org_id, user_id, role, added_by) values (i.org_id, auth.uid(), i.role, i.invited_by)
  on conflict (org_id, user_id) do nothing;
  update public.org_invites set accepted_by = auth.uid(), accepted_at = now() where id = p_invite;
  return i.org_id;
end $$;
revoke all on function public.kr_org_accept(uuid) from public, anon;
grant execute on function public.kr_org_accept(uuid) to authenticated;

-- Invitations waiting for the signed-in person (their email or phone).
create or replace function public.kr_org_my_invites() returns table (id uuid, org_id uuid, org_name text, kind text, role text, expires_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select i.id, o.id, o.name, o.kind, i.role, i.expires_at
    from public.org_invites i join public.organisations o on o.id = i.org_id, auth.users u
   where u.id = auth.uid() and i.accepted_at is null and i.expires_at > now()
     and (i.contact = lower(coalesce(u.email, ''))
          or (length(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g')) >= 10
              and right(regexp_replace(i.contact, '\D', '', 'g'), 10) = right(regexp_replace(u.phone, '\D', '', 'g'), 10)))
$$;
revoke all on function public.kr_org_my_invites() from public, anon;
grant execute on function public.kr_org_my_invites() to authenticated;

-- The people in a business, for its console: owners and managers see emails and phones in full (to
-- reach their team); staff see them hidden but for the start. Members of other businesses: nothing.
create or replace function public.kr_org_members(p_org uuid) returns table (user_id uuid, role text, label text, added_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = public, auth as $$
declare me text := public.kr_org_role(p_org);
begin
  if me is null and not public.kr_is_super_admin() then raise exception 'Not your business.' using errcode = '42501'; end if;
  return query
  select m.user_id, m.role,
         case when me in ('owner', 'manager') or public.kr_is_super_admin() or m.user_id = auth.uid()
              then coalesce(u.email::text, u.phone::text, 'account')
              else left(coalesce(u.email::text, u.phone::text, 'account'), 2) || '•••' end,
         m.added_at, m.user_id = auth.uid()
    from public.org_members m join auth.users u on u.id = m.user_id
   where m.org_id = p_org
   order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, m.added_at;
end $$;
revoke all on function public.kr_org_members(uuid) from public, anon;
grant execute on function public.kr_org_members(uuid) to authenticated;

-- Change someone's role, or remove them (role null). The owner does both; a manager only removes staff.
create or replace function public.kr_org_set_member(p_org uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare me text := public.kr_org_role(p_org); them text;
begin
  perform public.kr_org_writable(p_org);
  select role into them from public.org_members where org_id = p_org and user_id = p_user;
  if them is null then raise exception 'Not a member of this business.'; end if;
  if me = 'owner' then
    null;
  elsif me = 'manager' and them = 'staff' and p_role is null then
    null;
  else
    raise exception 'You cannot change this person.' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('owner', 'manager', 'staff') then raise exception 'Unknown role.'; end if;
  -- The last owner stays.
  if them = 'owner' and coalesce(p_role, '') <> 'owner'
     and (select count(*) from public.org_members where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'A business needs at least one owner: make someone else owner first.';
  end if;
  if p_role is null then
    delete from public.org_members where org_id = p_org and user_id = p_user;
  else
    update public.org_members set role = p_role where org_id = p_org and user_id = p_user;
  end if;
end $$;
revoke all on function public.kr_org_set_member(uuid, uuid, text) from public, anon;
grant execute on function public.kr_org_set_member(uuid, uuid, text) to authenticated;

-- Payout details: the owner, after two-step sign-in, sets them; owners and managers read them in full;
-- staff read only the name, the UPI ID and the last 4 digits of the account.
create or replace function public.kr_org_set_payout(p_org uuid, p_name text, p_upi text, p_account text, p_ifsc text, p_bank text) returns void
language plpgsql security definer set search_path = public as $$
declare before jsonb;
begin
  perform public.kr_org_writable(p_org);
  if public.kr_org_role(p_org) is distinct from 'owner' then raise exception 'Only the owner can change where the business is paid.' using errcode = '42501'; end if;
  if not public.kr_aal2() then raise exception 'Use your authenticator app first (two-step sign-in) to change bank or UPI details.' using errcode = '42501'; end if;
  select to_jsonb(a) - 'account_number' || jsonb_build_object('account_end', right(a.account_number, 4)) into before from public.org_payout_accounts a where org_id = p_org;
  insert into public.org_payout_accounts (org_id, account_name, upi_id, account_number, ifsc, bank_name, updated_by, updated_at)
  values (p_org, btrim(p_name), nullif(btrim(coalesce(p_upi, '')), ''), nullif(regexp_replace(coalesce(p_account, ''), '\s', '', 'g'), ''), nullif(upper(btrim(coalesce(p_ifsc, ''))), ''), nullif(btrim(coalesce(p_bank, '')), ''), auth.uid(), now())
  on conflict (org_id) do update set account_name = excluded.account_name, upi_id = excluded.upi_id, account_number = excluded.account_number,
    ifsc = excluded.ifsc, bank_name = excluded.bank_name, updated_by = excluded.updated_by, updated_at = now();
  -- The owners hear about it (20261108000000_email_outbox.sql), as with personal payout details.
  insert into public.email_outbox (kind, user_id, detail)
  select 'payout_changed', m.user_id, 'business: ' || left((select name from public.organisations where id = p_org), 60)
    from public.org_members m where m.org_id = p_org and m.role = 'owner';
end $$;
revoke all on function public.kr_org_set_payout(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.kr_org_set_payout(uuid, text, text, text, text, text) to authenticated;

create or replace function public.kr_org_payout(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me text := public.kr_org_role(p_org); a public.org_payout_accounts;
begin
  if me is null and not public.kr_is_super_admin() then raise exception 'Not your business.' using errcode = '42501'; end if;
  select * into a from public.org_payout_accounts where org_id = p_org;
  if not found then return null; end if;
  return jsonb_build_object('account_name', a.account_name, 'upi_id', a.upi_id, 'ifsc', a.ifsc, 'bank_name', a.bank_name, 'updated_at', a.updated_at,
    'account_end', right(a.account_number, 4),
    -- The full account number: owners and managers only.
    'account_number', case when me in ('owner', 'manager') then a.account_number end);
end $$;
revoke all on function public.kr_org_payout(uuid) from public, anon;
grant execute on function public.kr_org_payout(uuid) to authenticated;

-- ── Super Admin ──
create or replace function public.kr_super_suspend_org(p_org uuid, p_reason text, p_suspend boolean) returns text
language plpgsql security definer set search_path = public as $$
declare before jsonb;
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can do this.' using errcode = '42501'; end if;
  if p_suspend and char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Write the reason (the owner sees it).'; end if;
  select jsonb_build_object('suspended_at', suspended_at, 'reason', suspended_reason) into before from public.organisations where id = p_org;
  if before is null then return 'No such business.'; end if;
  update public.organisations
     set suspended_at = case when p_suspend then now() end,
         suspended_reason = case when p_suspend then btrim(p_reason) end
   where id = p_org;
  perform public.kr_audit(case when p_suspend then 'suspend_business' else 'reenable_business' end, p_org::text, before,
    jsonb_build_object('suspended', p_suspend), nullif(btrim(coalesce(p_reason, '')), ''));
  return case when p_suspend then 'suspended' else 're-enabled' end;
end $$;
revoke all on function public.kr_super_suspend_org(uuid, text, boolean) from public, anon;
grant execute on function public.kr_super_suspend_org(uuid, text, boolean) to authenticated;

-- Every business with its people count (the Super Admin's list).
create or replace function public.kr_super_orgs() returns table (id uuid, name text, kind text, created_at timestamptz, members bigint, owners text[], suspended boolean, suspended_reason text, has_payout boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can see this.' using errcode = '42501'; end if;
  return query
  select o.id, o.name, o.kind, o.created_at,
         (select count(*) from public.org_members m where m.org_id = o.id),
         coalesce((select array_agg(u.email::text) from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = o.id and m.role = 'owner'), '{}'),
         o.suspended_at is not null, o.suspended_reason,
         exists (select 1 from public.org_payout_accounts p where p.org_id = o.id)
    from public.organisations o order by o.created_at desc;
end $$;
revoke all on function public.kr_super_orgs() from public, anon;
grant execute on function public.kr_super_orgs() to authenticated;

notify pgrst, 'reload schema';
