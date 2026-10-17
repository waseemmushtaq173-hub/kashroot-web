-- KashRoot: daily mandi rates posted by approved reporters (traders,
-- commission agents, staff at the mandi). Government price services now
-- block automatic access (Agmarknet asks for a CAPTCHA, data.gov.in refuses
-- connections), so rates come straight from people at the mandi.
--
-- Run after 20261011000000_kashroot_core.sql. Safe to run again.
-- A person applies as a mandi reporter on the Mandi page; an admin approves
-- them in Admin → Approvals (role REPORTER).

-- ── the REPORTER role ──
alter table public.staff_roles drop constraint if exists staff_roles_role_check;
-- KASHMIRI: editors of the old Kashmiri Lab (since removed); still allowed so databases that set it up can run this again.
alter table public.staff_roles add constraint staff_roles_role_check check (role in ('ADMIN', 'EXPERT', 'DEALER', 'REPORTER', 'KASHMIRI'));
alter table public.role_requests drop constraint if exists role_requests_role_check;
alter table public.role_requests add constraint role_requests_role_check check (role in ('EXPERT', 'DEALER', 'REPORTER'));

create or replace function public.kr_request_role(p_role text, p_name text, p_phone text, p_email text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_role not in ('EXPERT', 'DEALER', 'REPORTER') then raise exception 'Unknown role'; end if;
  insert into public.role_requests (user_id, role, full_name, phone, email, details)
  values (auth.uid(), p_role, p_name, p_phone, p_email, p_details)
  on conflict (user_id, role) do update
    set full_name = excluded.full_name, phone = excluded.phone, email = excluded.email,
        details = excluded.details, status = 'pending', decided_by = null, decided_at = null, created_at = now()
    where public.role_requests.status <> 'approved';
end $$;

create or replace function public.kr_grant_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  if p_role not in ('ADMIN', 'EXPERT', 'DEALER', 'REPORTER') then raise exception 'Unknown role'; end if;
  insert into public.staff_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid())
  on conflict do nothing;
  update public.role_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where user_id = p_user and role = p_role;
end $$;

-- ── the rates ──
create table if not exists public.mandi_rates (
  id            uuid primary key default gen_random_uuid(),
  posted_by     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reporter_name text not null check (char_length(reporter_name) between 1 and 80),
  phone         text check (char_length(phone) <= 20),
  state         text not null default 'Jammu and Kashmir' check (char_length(state) between 2 and 60),
  district      text check (char_length(district) <= 60),
  mandi         text not null check (char_length(mandi) between 2 and 80),
  commodity     text not null check (char_length(commodity) between 2 and 60),
  variety       text check (char_length(variety) <= 60),
  grade         text check (char_length(grade) <= 30),
  unit          text not null check (unit in ('box', 'kg', 'quintal')),
  box_kg        numeric check (box_kg is null or (box_kg > 0 and box_kg <= 100)),
  min_price     numeric not null check (min_price > 0 and min_price < 10000000),
  modal_price   numeric not null check (modal_price > 0 and modal_price < 10000000),
  max_price     numeric not null check (max_price > 0 and max_price < 10000000),
  rate_date     date not null default ((now() at time zone 'Asia/Kolkata')::date),
  note          text check (char_length(note) <= 200),
  created_at    timestamptz not null default now(),
  check (min_price <= modal_price and modal_price <= max_price)
);
create index if not exists mandi_rates_recent on public.mandi_rates (rate_date desc, mandi, commodity);
alter table public.mandi_rates enable row level security;

drop policy if exists "Anyone can read mandi rates" on public.mandi_rates;
create policy "Anyone can read mandi rates" on public.mandi_rates for select using (true);

-- Only approved reporters (or admins) post, for today or yesterday, as themselves.
drop policy if exists "Reporters post rates" on public.mandi_rates;
create policy "Reporters post rates" on public.mandi_rates for insert to authenticated
  with check (
    posted_by = auth.uid()
    and (public.kr_has_role('REPORTER') or public.kr_has_role('ADMIN'))
    and rate_date between ((now() at time zone 'Asia/Kolkata')::date - 1) and ((now() at time zone 'Asia/Kolkata')::date)
  );
drop policy if exists "Reporters fix their own rates" on public.mandi_rates;
create policy "Reporters fix their own rates" on public.mandi_rates for update to authenticated
  using (posted_by = auth.uid() or public.kr_has_role('ADMIN'))
  with check (
    public.kr_has_role('ADMIN')
    or (posted_by = auth.uid()
        and rate_date between ((now() at time zone 'Asia/Kolkata')::date - 1) and ((now() at time zone 'Asia/Kolkata')::date))
  );
drop policy if exists "Reporters remove their own rates" on public.mandi_rates;
create policy "Reporters remove their own rates" on public.mandi_rates for delete to authenticated
  using (posted_by = auth.uid() or public.kr_has_role('ADMIN'));

grant select on public.mandi_rates to anon;
grant select, insert, update, delete on public.mandi_rates to authenticated;
