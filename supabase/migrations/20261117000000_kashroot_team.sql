-- KashRoot: the Super Admin and the KashRoot team — nobody else reaches Admin.
--   Super Admin: one account, set by SQL (20261113000000_super_admin.sql). Sees everything.
--   KashRoot team: people the Super Admin adds in Super Admin → Team (an ADMIN staff role, given
--     ONLY by kr_super_team_add). Each sees only the sections the Super Admin ticks for them —
--     none by default — and only after two-step sign-in and their admin code (kr_has_role('ADMIN')).
--   Everyone else — dealers, business owners / managers / staff, farmers, buyers, store owners —
--     never reaches an Admin page, function or table; their access is their own portal and the
--     Business console of a business they belong to (20261115000000_business_consoles.sql).
-- Before this, any ADMIN saw every Admin tab, and ADMIN could be given from three places
-- (Admin → Security → Admin team, Super Admin → People "Give Admin", approvals). Now every Admin
-- function and row rule checks its own section (kr_team_can), ADMIN is given only by
-- kr_super_team_add, and every team change is in the frozen audit log and emailed to the
-- support inbox. Existing ADMINs keep the role with NO sections ticked until the Super Admin
-- ticks them (or removes them). Run after 20261116000000_business_listings.sql. Safe to run again.

create table if not exists public.team_sections (
  user_id    uuid not null references auth.users (id) on delete cascade,
  section    text not null check (section in ('approvals', 'accounts', 'problems', 'help', 'contributors', 'coldstores', 'registry', 'numbers', 'security', 'setup', 'businesses', 'team', 'settings')),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, section)
);
alter table public.team_sections enable row level security;
revoke all on public.team_sections from anon, authenticated;
grant select on public.team_sections to authenticated;
drop policy if exists team_sections_read on public.team_sections;
create policy team_sections_read on public.team_sections for select to authenticated
  using (user_id = auth.uid() or public.kr_is_super_admin());

-- May the signed-in person use this Admin section now? The Super Admin: always. A team member:
-- when it is ticked for them AND they passed two-step sign-in and entered their admin code.
create or replace function public.kr_team_can(p_section text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.kr_is_super_admin()
      or (public.kr_has_role('ADMIN')
          and exists (select 1 from public.team_sections where user_id = auth.uid() and section = p_section))
$$;
revoke all on function public.kr_team_can(text) from public, anon;
grant execute on function public.kr_team_can(text) to authenticated;

-- The sections open to the signed-in person now: {'*'} for the Super Admin, the ticked ones for a
-- team member who passed two-step and the code, {} for everyone else.
create or replace function public.kr_team_sections() returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when public.kr_is_super_admin() then array['*']
    when public.kr_has_role('ADMIN') then coalesce((select array_agg(section order by section) from public.team_sections where user_id = auth.uid()), '{}')
    else '{}'::text[]
  end
$$;
revoke all on function public.kr_team_sections() from public, anon;
grant execute on function public.kr_team_sections() to authenticated;

-- Is the signed-in person the Super Admin or a team member with something ticked? (Before two-step:
-- only to decide whether to SHOW the Admin card; it opens nothing.)
create or replace function public.kr_team_member() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select public.kr_is_admin_account() and (
    exists (select 1 from public.team_sections where user_id = auth.uid())
    or exists (
      select 1 from auth.users u, public.kr_settings s
       where u.id = auth.uid() and s.id = 1 and s.super_admin_email is not null
         and lower(u.email) = lower(s.super_admin_email)
         and coalesce(u.raw_app_meta_data ->> 'kr_role', '') = 'super_admin'))
$$;
revoke all on function public.kr_team_member() from public, anon;
grant execute on function public.kr_team_member() to authenticated;

-- ════════ Every Admin function and row rule: its own section ════════
-- kr_admin_accounts (from 20261027000000_pan_and_signin.sql): admins → the "accounts" section.
create or replace function public.kr_admin_accounts()
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
  if not public.kr_team_can('accounts') then raise exception 'Only KashRoot admins can see this'; end if;
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
    -- Every account (no cap): Admin → Accounts reads them page by page. The
    -- id keeps the order the same between pages.
    order by coalesce(greatest(a.last_sign_in_at, a.renewed), a.joined_at) desc, a.id;
end $$;

-- kr_admin_stats (from 20261011000000_kashroot_core.sql): admins → the "numbers" section.
create or replace function public.kr_admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kr_team_can('numbers') then raise exception 'Only KashRoot admins can see this'; end if;
  return jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'accounts_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'portals', coalesce((
      select jsonb_object_agg(r, n) from (
        select r, count(*) as n
        from auth.users u,
          jsonb_array_elements_text(case when jsonb_typeof(u.raw_user_meta_data -> 'roles') = 'array'
            then u.raw_user_meta_data -> 'roles'
            else jsonb_build_array(coalesce(u.raw_user_meta_data ->> 'role', 'FARMER')) end) as r
        group by r) x), '{}'::jsonb),
    'products_on_sale', (select count(*) from public.market_listings where active and quantity > 0),
    'orders', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from public.market_orders group by status) x), '{}'::jsonb),
    'orders_paid_value', (select coalesce(sum(amount), 0) from public.market_orders where status = 'completed'),
    'cold_stores', (select count(*) from public.rental_listings where kind = 'cold_store' and active),
    'machinery', (select count(*) from public.rental_listings where kind = 'machinery' and active),
    'bookings', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from public.rental_bookings group by status) x), '{}'::jsonb),
    'advisory_total', (select count(*) from public.advisory_requests),
    'advisory_waiting', (select count(*) from public.advisory_requests where status in ('open', 'accepted')),
    'consignments', (select count(*) from public.consignments),
    'consignments_live', (select count(*) from public.consignments where status = 'in_transit'),
    'batches', (select count(*) from public.fertilizer_batches),
    'batch_reports', (select count(*) from public.batch_reports),
    'orchard_blocks', (select count(*) from public.orchard_blocks),
    'spray_logs', (select count(*) from public.spray_logs)
  );
end $$;

-- kr_admin_team (from 20261015000000_admin_team.sql): admins → the "team" section.
create or replace function public.kr_admin_team()
returns table (user_id uuid, email text, full_name text, granted_at timestamptz, has_code boolean, is_me boolean, is_owner boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kr_team_can('team') then raise exception 'Only an admin can do this'; end if;
  return query
    select s.user_id, u.email::text, coalesce(u.raw_user_meta_data ->> 'full_name', '')::text, s.granted_at,
           exists (select 1 from public.admin_lock l where l.user_id = s.user_id),
           s.user_id = auth.uid(),
           s.granted_by is null
      from public.staff_roles s join auth.users u on u.id = s.user_id
     where s.role = 'ADMIN'
     order by s.granted_at;
end $$;

-- kr_advisory_set (from 20261011000000_kashroot_core.sql): admins → the "help" section.
create or replace function public.kr_advisory_set(p_request uuid, p_action text, p_name text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.advisory_requests;
begin
  select * into r from public.advisory_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if p_action = 'accept' then
    if not (public.kr_has_role('EXPERT') or public.kr_team_can('help')) then raise exception 'Only an approved expert can accept'; end if;
    if r.status = 'closed' then raise exception 'This request is closed'; end if;
    update public.advisory_requests set status = 'accepted', expert_id = auth.uid(), expert_name = coalesce(nullif(trim(p_name), ''), expert_name) where id = p_request;
  elsif p_action = 'close' then
    if not (r.farmer_id = auth.uid() or r.expert_id = auth.uid() or public.kr_team_can('help')) then raise exception 'Not allowed'; end if;
    update public.advisory_requests set status = 'closed' where id = p_request;
  elsif p_action = 'reopen' then
    if r.farmer_id <> auth.uid() then raise exception 'Not allowed'; end if;
    update public.advisory_requests set status = 'open' where id = p_request;
  else
    raise exception 'Unknown action';
  end if;
end $$;

-- kr_can_see_request (from 20261011000000_kashroot_core.sql): admins → the "help" section.
create or replace function public.kr_can_see_request(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.advisory_requests r
    where r.id = p_request
      and (r.farmer_id = auth.uid() or public.kr_has_role('EXPERT') or public.kr_team_can('help'))
  )
$$;

-- kr_cold_suggestion_before (from 20261024000000_cold_store_suggestions.sql): admins → the "coldstores" section.
create or replace function public.kr_cold_suggestion_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and not public.kr_team_can('coldstores') then
    if (select count(*) from public.cold_store_directory
         where added_by = auth.uid() and status = 'pending' and created_at > now() - interval '1 day') >= 20 then
      raise exception 'Thank you — that is enough suggestions for today. Please send more tomorrow.';
    end if;
    new.source := 'Suggested by a KashRoot user';
    new.source_url := null;
    new.lat := null;
    new.lon := null;
  end if;
  return new;
end $$;

-- kr_contributors (from 20261013000000_contributors.sql): admins → the "contributors" section.
create or replace function public.kr_contributors()
returns table (
  user_id uuid, name text, email text, phone text, roles text[],
  accepted bigint, pending bigint, rejected bigint, unpaid bigint, due numeric, paid numeric,
  upi_id text, account_number text, ifsc text, last_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.kr_team_can('contributors') then raise exception 'Only an admin can do this'; end if;
  return query
  select c.user_id,
         coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email::text, '@', 1)),
         u.email::text,
         coalesce(nullif(u.raw_user_meta_data ->> 'phone', ''),
                  (select rr.phone from public.role_requests rr where rr.user_id = c.user_id and rr.phone is not null order by rr.created_at desc limit 1)),
         (select array_agg(s.role order by s.role) from public.staff_roles s where s.user_id = c.user_id),
         count(*) filter (where c.status = 'accepted'),
         count(*) filter (where c.status = 'pending'),
         count(*) filter (where c.status = 'rejected'),
         count(*) filter (where c.status = 'accepted' and c.paid_at is null),
         coalesce(sum(p.amount) filter (where c.status = 'accepted' and c.paid_at is null), 0),
         coalesce(sum(c.paid_amount), 0),
         pa.upi_id, pa.account_number, pa.ifsc,
         max(c.created_at)
    from public.contributions c
    join auth.users u on u.id = c.user_id
    left join public.pay_rates p on p.kind = c.kind
    left join public.payout_accounts pa on pa.user_id = c.user_id
   group by c.user_id, u.raw_user_meta_data, u.email, pa.upi_id, pa.account_number, pa.ifsc
   order by max(c.created_at) desc;
end $$;

-- kr_decide_rate (from 20261013000000_contributors.sql): admins → the "contributors" section.
create or replace function public.kr_decide_rate(p_rate uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.kr_team_can('contributors') then raise exception 'Only an admin can do this'; end if;
  perform set_config('kr.trusted', 'on', true);
  update public.mandi_rates
     set status = case when p_ok then 'verified' else 'wrong' end, final = true, checked_by = auth.uid(), checked_at = now()
   where id = p_rate;
  get diagnostics n = row_count;
  perform set_config('kr.trusted', 'off', true);
  if n = 0 then raise exception 'Rate not found'; end if;
end $$;

-- kr_decide_work (from 20261013000000_contributors.sql): admins → the "contributors" section.
create or replace function public.kr_decide_work(p_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contributions;
begin
  if not public.kr_team_can('contributors') then raise exception 'Only an admin can do this'; end if;
  select * into c from public.contributions where id = p_id;
  if not found then raise exception 'Not found'; end if;
  if c.paid_at is not null then raise exception 'Already paid'; end if;
  if c.kind = 'mandi_rate' then
    perform public.kr_decide_rate(c.ref_id::uuid, p_ok);
  else
    update public.contributions set status = case when p_ok then 'accepted' else 'rejected' end, final = true, decided_at = now() where id = p_id;
  end if;
end $$;

-- kr_directory_import (from 20261023000000_cold_store_directory.sql): admins → the "coldstores" section.
create or replace function public.kr_directory_import(p_rows jsonb, p_source text, p_source_url text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare added integer;
begin
  if not public.kr_team_can('coldstores') then raise exception 'Only an admin can import cold stores'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Import at most 5,000 cold stores at a time'; end if;
  if char_length(trim(coalesce(p_source, ''))) < 2 then raise exception 'Say where the list comes from'; end if;
  with rows as (
    select left(trim(r ->> 'name'), 120) as name,
           nullif(left(trim(r ->> 'district'), 60), '') as district,
           nullif(left(trim(r ->> 'place'), 160), '') as place,
           coalesce(nullif(left(trim(r ->> 'state'), 60), ''), 'Jammu & Kashmir') as state,
           case when (r ->> 'capacity_mt') ~ '^[0-9]{1,7}$' and (r ->> 'capacity_mt')::int between 1 and 1000000 then (r ->> 'capacity_mt')::int end as capacity_mt,
           case when r ->> 'kind' in ('ca', 'cold', 'multi') then r ->> 'kind' end as kind,
           case when char_length(regexp_replace(coalesce(r ->> 'phone', ''), '\s', '', 'g')) between 6 and 20 then regexp_replace(r ->> 'phone', '\s', '', 'g') end as phone,
           case when (r ->> 'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' and (r ->> 'lat')::float8 between -90 and 90 then (r ->> 'lat')::float8 end as lat,
           case when (r ->> 'lon') ~ '^-?[0-9]+(\.[0-9]+)?$' and (r ->> 'lon')::float8 between -180 and 180 then (r ->> 'lon')::float8 end as lon
      from jsonb_array_elements(p_rows) r
     where char_length(trim(coalesce(r ->> 'name', ''))) between 2 and 120
  ), ins as (
    insert into public.cold_store_directory (name, district, place, state, capacity_mt, kind, phone, lat, lon, source, source_url)
    select distinct on (lower(name), lower(coalesce(district, ''))) name, district, place, state, capacity_mt, kind, phone, lat, lon,
           left(trim(p_source), 200), case when p_source_url ~ '^https?://' then left(p_source_url, 500) end
      from rows
    on conflict do nothing
    returning 1
  )
  select count(*) into added from ins;
  return added;
end $$;

-- kr_email_status (from 20261108000000_email_outbox.sql): admins → the "setup" section.
create or replace function public.kr_email_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kr_team_can('setup') then raise exception 'Only KashRoot admins can see this' using errcode = '42501'; end if;
  return jsonb_build_object(
    'waiting', (select count(*) from public.email_outbox where status = 'pending'),
    'failed_24h', (select count(*) from public.email_outbox where status = 'failed' and created_at > now() - interval '24 hours'),
    'sent_24h', (select count(*) from public.email_outbox where status = 'sent' and sent_at > now() - interval '24 hours'),
    'last_error', (select last_error from public.email_outbox where last_error is not null order by id desc limit 1));
end $$;

-- kr_is_editor (from 20261102000000_assistant_answers.sql): admins → the "help" section.
create or replace function public.kr_is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.kr_has_role('EXPERT') or public.kr_team_can('help')
$$;

-- kr_mark_paid (from 20261013000000_contributors.sql): admins → the "contributors" section.
create or replace function public.kr_mark_paid(p_user uuid, p_ref text) returns numeric
language plpgsql security definer set search_path = public as $$
declare total numeric;
begin
  if not public.kr_team_can('contributors') then raise exception 'Only an admin can do this'; end if;
  with paid as (
    update public.contributions c
       set paid_at = now(), paid_ref = left(nullif(trim(p_ref), ''), 80),
           paid_amount = coalesce((select p.amount from public.pay_rates p where p.kind = c.kind), 0)
     where c.user_id = p_user and c.status = 'accepted' and c.paid_at is null
    returning c.paid_amount
  )
  select coalesce(sum(paid_amount), 0) into total from paid;
  return total;
end $$;

-- kr_registry_import (from 20261029000000_official_registry.sql): admins → the "registry" section.
create or replace function public.kr_registry_import(p_rows jsonb, p_kind text, p_source text, p_source_url text)
returns integer
language plpgsql security definer set search_path = public as $$
declare added integer;
begin
  if not public.kr_team_can('registry') then raise exception 'Only an admin can import an official list'; end if;
  if p_kind is null or p_kind not in ('pesticide', 'fertiliser', 'seed', 'other') then raise exception 'Choose what the list is: pesticides, fertilisers, seeds or other'; end if;
  if char_length(trim(coalesce(p_source, ''))) not between 2 and 200 then raise exception 'Write the name of the list (where it comes from)'; end if;
  if coalesce(p_source_url, '') !~ '^https?://' or char_length(p_source_url) > 500 then raise exception 'Add the link to the list (starting with https://)'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Import at most 2,000 rows at a time'; end if;
  with rows as (
    select left(regexp_replace(trim(r ->> 'name'), '\s+', ' ', 'g'), 300) as name,
           nullif(left(regexp_replace(trim(coalesce(r ->> 'registration_no', '')), '\s+', ' ', 'g'), 200), '') as registration_no,
           nullif(left(regexp_replace(trim(coalesce(r ->> 'registrant', '')), '\s+', ' ', 'g'), 200), '') as registrant,
           case when jsonb_typeof(r -> 'details') = 'object' and pg_column_size(r -> 'details') <= 4000 then r -> 'details' else '{}'::jsonb end as details
      from jsonb_array_elements(p_rows) r
     where jsonb_typeof(r) = 'object' and char_length(trim(coalesce(r ->> 'name', ''))) between 2 and 300
  ), ins as (
    insert into public.official_products (kind, name, registration_no, registrant, details, source, source_url, imported_at, imported_by)
    select distinct on (coalesce(public.kr_reg_core(registration_no), ''), lower(name), lower(coalesce(registrant, '')))
           p_kind, name, registration_no, registrant, details, trim(p_source), p_source_url, now(), auth.uid()
      from rows
    on conflict (kind, source, (coalesce(reg_core, '')), (lower(name)), (lower(coalesce(registrant, ''))))
      do update set imported_at = excluded.imported_at, details = excluded.details, source_url = excluded.source_url
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new) into added from ins;
  return added;
end $$;

-- kr_registry_remove (from 20261029000000_official_registry.sql): admins → the "registry" section.
create or replace function public.kr_registry_remove(p_source text, p_kind text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  if not public.kr_team_can('registry') then raise exception 'Only an admin can remove an official list'; end if;
  delete from public.official_products where source = p_source and (p_kind is null or kind = p_kind);
  get diagnostics removed = row_count;
  return removed;
end $$;

-- kr_reject_role (from 20261011000000_kashroot_core.sql): admins → the "approvals" section.
create or replace function public.kr_reject_role(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_team_can('approvals') then raise exception 'Only an admin can do this'; end if;
  update public.role_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now()
  where id = p_request and status = 'pending';
end $$;

-- kr_security_summary (from 20261106000000_security_hardening.sql): admins → the "security" section.
create or replace function public.kr_security_summary(p_hours integer default 24)
returns table (kind text, events bigint, networks bigint, top_network text, top_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kr_team_can('security') then raise exception 'Only KashRoot admins can see this.' using errcode = '42501'; end if;
  return query
    with recent as (select * from public.security_events e where e.at > now() - make_interval(hours => least(greatest(p_hours, 1), 720))),
    per as (select r.kind, r.ip_hash, count(*) as n from recent r group by r.kind, r.ip_hash),
    top as (select distinct on (p.kind) p.kind, p.ip_hash, p.n from per p order by p.kind, p.n desc)
    select r.kind, count(*)::bigint, count(distinct r.ip_hash)::bigint, t.ip_hash, t.n::bigint
      from recent r left join top t on t.kind = r.kind
     group by r.kind, t.ip_hash, t.n
     order by count(*) desc;
end $$;

-- kr_set_kyc_rules (from 20261014000000_trust_and_security.sql): admins → the "approvals" section.
create or replace function public.kr_set_kyc_rules(p_required boolean, p_pan boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_team_can('approvals') then raise exception 'Only an admin can do this'; end if;
  if p_required and (select kyc_secret is null from public.kr_settings where id = 1) then
    raise exception 'Set up KYC recording first (KYC_DB_SECRET), or nobody could pass the check';
  end if;
  update public.kr_settings set kyc_required = p_required, pan_required = p_pan, updated_at = now() where id = 1;
end $$;

-- kr_setup_status (from 20261031000000_setup_check.sql): admins → the "setup" section.
create or replace function public.kr_setup_status() returns table (step int, part text, file text, done text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kr_team_can('setup') then raise exception 'Only KashRoot admins can see this'; end if;
  return query select * from public.kr_setup_rows();
end $$;

-- kr_support_note (from 20261109000000_support_tracking.sql): admins → the "help" section.
create or replace function public.kr_support_note(p_id uuid, p_body text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_team_can('help') then raise exception 'Only KashRoot admins can do this.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then return false; end if;
  if not exists (select 1 from public.support_requests where id = p_id) then return false; end if;
  insert into public.support_messages (request_id, author, author_name, body) values (p_id, 'internal', 'KashRoot staff', btrim(p_body));
  return true;
end $$;

-- kr_support_reply (from 20261105000000_support_desk.sql): admins → the "help" section.
create or replace function public.kr_support_reply(p_id uuid, p_body text, p_close boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_team_can('help') then raise exception 'Only KashRoot admins can reply.' using errcode = '42501'; end if;
  if not exists (select 1 from public.support_requests where id = p_id) then return false; end if;
  if char_length(btrim(coalesce(p_body, ''))) > 0 then
    insert into public.support_messages (request_id, author, author_name, body) values (p_id, 'kashroot', 'KashRoot support', btrim(p_body));
  end if;
  update public.support_requests set status = case when p_close then 'closed' else 'answered' end, updated_at = now() where id = p_id;
  return true;
end $$;

-- kr_support_set_status (from 20261109000000_support_tracking.sql): admins → the "help" section.
create or replace function public.kr_support_set_status(p_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_team_can('help') then raise exception 'Only KashRoot admins can do this.' using errcode = '42501'; end if;
  if p_status not in ('open', 'in_progress', 'answered', 'closed') then raise exception 'Unknown status.'; end if;
  update public.support_requests set status = p_status, updated_at = now() where id = p_id;
  return found;
end $$;

-- advisory_messages "Participants write messages" (from 20261011000000_kashroot_core.sql): admins → the "help" section.
drop policy if exists "Participants write messages" on public.advisory_messages;
create policy "Participants write messages" on public.advisory_messages for insert to authenticated
  with check (
    sender_id = auth.uid() and (
      (sender_role in ('farmer', 'ai') and exists (select 1 from public.advisory_requests r where r.id = request_id and r.farmer_id = auth.uid()))
      or (sender_role = 'expert' and (public.kr_has_role('EXPERT') or public.kr_team_can('help')))
    )
  );

-- advisory_requests "Farmers see theirs, experts see all" (from 20261011000000_kashroot_core.sql): admins → the "help" section.
drop policy if exists "Farmers see theirs, experts see all" on public.advisory_requests;
create policy "Farmers see theirs, experts see all" on public.advisory_requests for select to authenticated
  using (farmer_id = auth.uid() or public.kr_has_role('EXPERT') or public.kr_team_can('help'));

-- batch_reports "Own reports, admins see all" (from 20261011000000_kashroot_core.sql): admins → the "approvals" section.
drop policy if exists "Own reports, admins see all" on public.batch_reports;
create policy "Own reports, admins see all" on public.batch_reports for select to authenticated
  using (reporter_id = auth.uid() or public.kr_team_can('approvals'));

-- cold_store_directory cold_store_directory_admin (from 20261023000000_cold_store_directory.sql): admins → the "coldstores" section.
drop policy if exists cold_store_directory_admin on public.cold_store_directory;
create policy cold_store_directory_admin on public.cold_store_directory for all to authenticated
  using (public.kr_team_can('coldstores')) with check (public.kr_team_can('coldstores'));

-- cold_store_directory cold_store_directory_read (from 20261024000000_cold_store_suggestions.sql): admins → the "coldstores" section.
drop policy if exists cold_store_directory_read on public.cold_store_directory;
create policy cold_store_directory_read on public.cold_store_directory for select to anon, authenticated
  using (status = 'approved' or added_by = auth.uid() or public.kr_team_can('coldstores'));

-- contributions "Own contributions, admins all" (from 20261013000000_contributors.sql): admins → the "contributors" section.
drop policy if exists "Own contributions, admins all" on public.contributions;
create policy "Own contributions, admins all" on public.contributions for select to authenticated
  using (user_id = auth.uid() or public.kr_team_can('contributors'));

-- identity_checks "Own KYC, admins all" (from 20261014000000_trust_and_security.sql): admins → the "approvals" section.
drop policy if exists "Own KYC, admins all" on public.identity_checks;
create policy "Own KYC, admins all" on public.identity_checks for select to authenticated
  using (user_id = auth.uid() or public.kr_team_can('approvals'));

-- mandi_rate_checks "Own checks, checks on own rates, admins all" (from 20261013000000_contributors.sql): admins → the "contributors" section.
drop policy if exists "Own checks, checks on own rates, admins all" on public.mandi_rate_checks;
create policy "Own checks, checks on own rates, admins all" on public.mandi_rate_checks for select to authenticated
  using (
    user_id = auth.uid() or public.kr_team_can('contributors')
    or exists (select 1 from public.mandi_rates r where r.id = rate_id and r.posted_by = auth.uid())
  );

-- mandi_rates "Reporters fix their own rates" (from 20261012000000_mandi_rates.sql): admins → the "contributors" section.
drop policy if exists "Reporters fix their own rates" on public.mandi_rates;
create policy "Reporters fix their own rates" on public.mandi_rates for update to authenticated
  using (posted_by = auth.uid() or public.kr_team_can('contributors'))
  with check (
    public.kr_team_can('contributors')
    or (posted_by = auth.uid()
        and rate_date between ((now() at time zone 'Asia/Kolkata')::date - 1) and ((now() at time zone 'Asia/Kolkata')::date))
  );

-- mandi_rates "Reporters post rates" (from 20261012000000_mandi_rates.sql): admins → the "contributors" section.
drop policy if exists "Reporters post rates" on public.mandi_rates;
create policy "Reporters post rates" on public.mandi_rates for insert to authenticated
  with check (
    posted_by = auth.uid()
    and (public.kr_has_role('REPORTER') or public.kr_team_can('contributors'))
    and rate_date between ((now() at time zone 'Asia/Kolkata')::date - 1) and ((now() at time zone 'Asia/Kolkata')::date)
  );

-- mandi_rates "Reporters remove their own rates" (from 20261012000000_mandi_rates.sql): admins → the "contributors" section.
drop policy if exists "Reporters remove their own rates" on public.mandi_rates;
create policy "Reporters remove their own rates" on public.mandi_rates for delete to authenticated
  using (posted_by = auth.uid() or public.kr_team_can('contributors'));

-- market_orders "Admins see reported orders" (from 20261011000000_kashroot_core.sql): admins → the "problems" section.
drop policy if exists "Admins see reported orders" on public.market_orders;
create policy "Admins see reported orders" on public.market_orders for select to authenticated
  using (status = 'disputed' and public.kr_team_can('problems'));

-- official_products official_products_admin (from 20261029000000_official_registry.sql): admins → the "registry" section.
drop policy if exists official_products_admin on public.official_products;
create policy official_products_admin on public.official_products for all to authenticated
  using (public.kr_team_can('registry')) with check (public.kr_team_can('registry'));

-- pay_rates "Admins set pay rates" (from 20261013000000_contributors.sql): admins → the "contributors" section.
drop policy if exists "Admins set pay rates" on public.pay_rates;
create policy "Admins set pay rates" on public.pay_rates for update to authenticated
  using (public.kr_team_can('contributors')) with check (public.kr_team_can('contributors'));

-- role_requests "Own requests, admins see all" (from 20261011000000_kashroot_core.sql): admins → the "approvals" section.
drop policy if exists "Own requests, admins see all" on public.role_requests;
create policy "Own requests, admins see all" on public.role_requests for select to authenticated
  using (user_id = auth.uid() or public.kr_team_can('approvals'));

-- security_events "Admins read security events" (from 20261106000000_security_hardening.sql): admins → the "security" section.
drop policy if exists "Admins read security events" on public.security_events;
create policy "Admins read security events" on public.security_events for select to authenticated using (public.kr_team_can('security'));

-- security_log security_log_admins (from 20261017000000_security_log.sql): admins → the "security" section.
drop policy if exists security_log_admins on public.security_log;
create policy security_log_admins on public.security_log for select to authenticated using (public.kr_team_can('security'));

-- staff_roles "Own roles, admins see all" (from 20261011000000_kashroot_core.sql): admins → the "approvals" section.
drop policy if exists "Own roles, admins see all" on public.staff_roles;
create policy "Own roles, admins see all" on public.staff_roles for select to authenticated
  using (user_id = auth.uid() or public.kr_team_can('approvals'));

-- support_messages "Messages of own requests, admins see all" (from 20261109000000_support_tracking.sql): admins → the "help" section.
drop policy if exists "Messages of own requests, admins see all" on public.support_messages;
create policy "Messages of own requests, admins see all" on public.support_messages for select to authenticated
  using (public.kr_team_can('help') or (author <> 'internal' and exists (select 1 from public.support_requests r where r.id = request_id and r.user_id = auth.uid())));

-- support_requests "Own requests, admins see all" (from 20261105000000_support_desk.sql): admins → the "help" section.
drop policy if exists "Own requests, admins see all" on public.support_requests;
create policy "Own requests, admins see all" on public.support_requests for select to authenticated
  using (user_id = auth.uid() or public.kr_team_can('help'));

-- ════════ Managing the team: the Super Admin only, audited, emailed ════════
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
-- The one complete list (the same in every migration that sets it, newest: 20261120000000_trip_lock.sql),
-- so RUN_THIS_ONCE.sql can be run again on a database that already holds every kind.
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'help_new', 'help_ack', 'help_reply', 'help_resolved', 'payout_changed', 'password_changed', 'email_changed', 'phone_changed', 'new_signin', 'signin_locked', 'team_changed', 'trip_lost'));

-- A team change: in the audit log, and an email to the support inbox (lib/emailLetters "team_changed").
create or replace function public.kr_team_note(p_action text, p_user uuid, p_before jsonb, p_after jsonb) returns void
language plpgsql security definer set search_path = public, auth as $$
declare who text := (select email from auth.users where id = p_user);
begin
  perform public.kr_audit(p_action, coalesce(who, p_user::text), p_before, p_after, null);
  insert into public.email_outbox (kind, detail)
  values ('team_changed', left(replace(p_action, 'team_', '') || ': ' || coalesce(who, 'an account') ||
    coalesce(' → ' || (select string_agg(x, ', ') from jsonb_array_elements_text(p_after -> 'sections') x), ''), 80));
end $$;
revoke all on function public.kr_team_note(text, uuid, jsonb, jsonb) from public, anon, authenticated;

-- The team: everyone with the ADMIN staff role, their ticked sections and two-step.
create or replace function public.kr_super_team()
returns table (user_id uuid, email text, sections text[], two_step boolean, last_sign_in_at timestamptz, added_at timestamptz, added_by text, is_super boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.kr_team_can('team') then raise exception 'Only the Super Admin can see this.' using errcode = '42501'; end if;
  return query
  select s.user_id, u.email::text,
         coalesce((select array_agg(t.section order by t.section) from public.team_sections t where t.user_id = s.user_id), '{}'),
         exists (select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.status = 'verified'),
         u.last_sign_in_at, s.granted_at,
         (select g.email::text from auth.users g where g.id = s.granted_by),
         coalesce(u.raw_app_meta_data ->> 'kr_role', '') = 'super_admin'
    from public.staff_roles s join auth.users u on u.id = s.user_id
   where s.role = 'ADMIN'
   order by s.granted_at;
end $$;
revoke all on function public.kr_super_team() from public, anon;
grant execute on function public.kr_super_team() to authenticated;

-- "Add to my KashRoot team": the account must exist; nothing is ticked yet.
create or replace function public.kr_super_team_add(p_email text) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can add people to the KashRoot team.' using errcode = '42501'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'No KashRoot account with that email. Ask them to create an account first, then add them again.'; end if;
  if exists (select 1 from public.staff_roles where user_id = uid and role = 'ADMIN') then raise exception 'Already in the KashRoot team.'; end if;
  insert into public.staff_roles (user_id, role, granted_by) values (uid, 'ADMIN', auth.uid());
  perform public.kr_team_note('team_add', uid, null, jsonb_build_object('team', true, 'sections', '[]'::jsonb));
  return uid;
end $$;
revoke all on function public.kr_super_team_add(text) from public, anon;
grant execute on function public.kr_super_team_add(text) to authenticated;

-- Tick exactly these sections for a team member (the rest are unticked).
create or replace function public.kr_super_team_set(p_user uuid, p_sections text[]) returns text[]
language plpgsql security definer set search_path = public, auth as $$
declare before text[]; after text[];
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can change what the team sees.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'The Super Admin already sees everything.'; end if;
  if not exists (select 1 from public.staff_roles where user_id = p_user and role = 'ADMIN') then raise exception 'Not in the KashRoot team: add them first.'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into after from unnest(coalesce(p_sections, '{}')) x;
  if exists (select 1 from unnest(after) x where x not in ('approvals', 'accounts', 'problems', 'help', 'contributors', 'coldstores', 'registry', 'numbers', 'security', 'setup', 'businesses', 'team', 'settings')) then
    raise exception 'Unknown section.';
  end if;
  select coalesce(array_agg(section order by section), '{}') into before from public.team_sections where user_id = p_user;
  delete from public.team_sections where user_id = p_user and not (section = any (after));
  insert into public.team_sections (user_id, section, granted_by) select p_user, x, auth.uid() from unnest(after) x on conflict do nothing;
  if before is distinct from after then
    perform public.kr_team_note('team_sections', p_user, jsonb_build_object('sections', to_jsonb(before)), jsonb_build_object('sections', to_jsonb(after)));
  end if;
  return after;
end $$;
revoke all on function public.kr_super_team_set(uuid, text[]) from public, anon;
grant execute on function public.kr_super_team_set(uuid, text[]) to authenticated;

-- Remove from the team: the ADMIN role, every tick and their admin code go.
create or replace function public.kr_super_team_remove(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare before text[];
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can remove people from the KashRoot team.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot remove yourself.'; end if;
  select coalesce(array_agg(section order by section), '{}') into before from public.team_sections where user_id = p_user;
  delete from public.team_sections where user_id = p_user;
  delete from public.staff_roles where user_id = p_user and role = 'ADMIN';
  delete from public.admin_lock where user_id = p_user;
  perform public.kr_team_note('team_remove', p_user, jsonb_build_object('team', true, 'sections', to_jsonb(before)), jsonb_build_object('team', false));
end $$;
revoke all on function public.kr_super_team_remove(uuid) from public, anon;
grant execute on function public.kr_super_team_remove(uuid) to authenticated;

-- ════════ The old ways to give ADMIN: closed ════════
-- Approvals give EXPERT, DEALER and REPORTER only — never ADMIN.
create or replace function public.kr_grant_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_team_can('approvals') then raise exception 'Only an admin can do this'; end if;
  if p_role = 'ADMIN' then raise exception 'Admin access is given only in Super Admin → Team → Add to my KashRoot team.' using errcode = '42501'; end if;
  if p_role not in ('EXPERT', 'DEALER', 'REPORTER') then raise exception 'Unknown role'; end if;
  insert into public.staff_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid())
  on conflict do nothing;
  update public.role_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where user_id = p_user and role = p_role;
  if public.kr_is_super_admin() then perform public.kr_audit('grant_role', p_user::text, null, jsonb_build_object('role', p_role), null); end if;
end $$;

-- Taking a role away: ADMIN only through the team (audited, emailed).
create or replace function public.kr_revoke_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_role = 'ADMIN' then
    perform public.kr_super_team_remove(p_user);
    return;
  end if;
  if not public.kr_team_can('approvals') then raise exception 'Only an admin can do this'; end if;
  delete from public.staff_roles where user_id = p_user and role = p_role;
end $$;

-- Admin → Security → Admin team and Super Admin → People "Give Admin": now the Team section.
create or replace function public.kr_add_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Use Super Admin → Team → Add to my KashRoot team.' using errcode = '42501';
end $$;
create or replace function public.kr_super_set_admin(p_user uuid, p_admin boolean, p_reason text) returns text
language plpgsql security definer set search_path = public, auth as $$
begin
  raise exception 'Use Super Admin → Team: Add to my KashRoot team, or Remove from the team.' using errcode = '42501';
end $$;

-- Settings ("Ask everyone to tap the box"): the Super Admin, or a team member with Settings ticked.
create or replace function public.kr_super_set_gate_tap(p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare was boolean;
begin
  if not public.kr_team_can('settings') then raise exception 'Only the Super Admin can do this.' using errcode = '42501'; end if;
  insert into public.kr_settings (id) values (1) on conflict (id) do nothing;
  select gate_tap into was from public.kr_settings where id = 1;
  update public.kr_settings set gate_tap = coalesce(p_on, false), updated_at = now() where id = 1;
  perform public.kr_audit('set_gate_tap', 'security gate', jsonb_build_object('tap', was), jsonb_build_object('tap', coalesce(p_on, false)), null);
  return coalesce(p_on, false);
end $$;

-- Businesses: the Super Admin, or a team member with Businesses ticked (read only — suspending
-- stays with the Super Admin, kr_super_suspend_org).
create or replace function public.kr_super_orgs() returns table (id uuid, name text, kind text, created_at timestamptz, members bigint, owners text[], suspended boolean, suspended_reason text, has_payout boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.kr_team_can('businesses') then raise exception 'Only the Super Admin can see this.' using errcode = '42501'; end if;
  return query
  select o.id, o.name, o.kind, o.created_at,
         (select count(*) from public.org_members m where m.org_id = o.id),
         coalesce((select array_agg(u.email::text) from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = o.id and m.role = 'owner'), '{}'),
         o.suspended_at is not null, o.suspended_reason,
         exists (select 1 from public.org_payout_accounts p where p.org_id = o.id)
    from public.organisations o order by o.created_at desc;
end $$;

notify pgrst, 'reload schema';
