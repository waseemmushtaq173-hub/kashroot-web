-- KashRoot: ALL database setup in one file.
-- Supabase → SQL Editor → New query → paste this whole file → Run.
-- Safe to run more than once: it only adds what is missing and updates functions.
-- Generated from supabase/migrations/ (oldest first).

-- ════════ 20261010000000_fertilizer_batches.sql ════════
-- Shared fertiliser / agro-input batch registry.
-- Anyone can look a batch up; only accounts an administrator has approved as
-- DEALER, MANUFACTURER or ADMIN (set in app_metadata, which users cannot edit)
-- can register or edit batches.
--
-- Run once: Supabase dashboard → SQL Editor → paste → Run.
-- Approve a dealer: Authentication → Users → user → edit "Raw app meta data":
--   { "role": "DEALER" }

create table if not exists public.fertilizer_batches (
  batch_code    text primary key check (char_length(batch_code) between 3 and 40),
  product       text not null,
  manufacturer  text not null,
  grade         text,
  mfg_date      date,
  expiry_date   date,
  registered_by uuid default auth.uid() references auth.users (id) on delete set null,
  registered_at timestamptz not null default now()
);

alter table public.fertilizer_batches enable row level security;

drop policy if exists "Anyone can verify a batch" on public.fertilizer_batches;
create policy "Anyone can verify a batch"
  on public.fertilizer_batches for select
  using (true);

drop policy if exists "Approved dealers register batches" on public.fertilizer_batches;
create policy "Approved dealers register batches"
  on public.fertilizer_batches for insert to authenticated
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('DEALER', 'MANUFACTURER', 'ADMIN')
    and registered_by = auth.uid()
  );

drop policy if exists "Dealers edit their own batches" on public.fertilizer_batches;
create policy "Dealers edit their own batches"
  on public.fertilizer_batches for update to authenticated
  using (registered_by = auth.uid())
  with check (registered_by = auth.uid());

-- ════════ 20261011000000_kashroot_core.sql ════════
-- KashRoot shared data, used by every portal:
--   * staff roles (admin, agronomist/expert, verified dealer) and requests for them
--   * advisory: questions, soil-test bookings and video calls between farmers and experts
--   * rentals: cold stores and machinery, with bookings paid straight to the owner by UPI
--   * marketplace listings and pay-after-delivery orders
--   * payout (bank / UPI) details, shown only to the other side of a booking or order
--   * consignments tracked by the driver's phone GPS
--   * orchard blocks and spray logs
--   * an open fertiliser / pesticide batch registry with dealer verification
--
-- Run once: Supabase dashboard → SQL Editor → New query → paste this file → Run.
-- It is safe to run again. Then make yourself the admin (same SQL Editor):
--   select public.kr_make_admin('you@example.com');
--
-- Every table has row-level security. Status changes that involve both sides
-- (accepting a booking, confirming a payment) go through the kr_* functions,
-- which check who is calling, so nobody can edit the other side's fields.

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.kr_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── staff roles ─────────────────────────
create table if not exists public.staff_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('ADMIN', 'EXPERT', 'DEALER', 'REPORTER')),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.staff_roles enable row level security;

create or replace function public.kr_has_role(wanted text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_roles where user_id = auth.uid() and role = wanted)
$$;

drop policy if exists "Own roles, admins see all" on public.staff_roles;
create policy "Own roles, admins see all" on public.staff_roles for select to authenticated
  using (user_id = auth.uid() or public.kr_has_role('ADMIN'));

create table if not exists public.role_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role       text not null check (role in ('EXPERT', 'DEALER', 'REPORTER')),
  full_name  text not null check (char_length(full_name) between 1 and 80),
  phone      text check (char_length(phone) <= 20),
  email      text check (char_length(email) <= 120),
  details    text check (char_length(details) <= 1000),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.role_requests enable row level security;
drop policy if exists "Own requests, admins see all" on public.role_requests;
create policy "Own requests, admins see all" on public.role_requests for select to authenticated
  using (user_id = auth.uid() or public.kr_has_role('ADMIN'));

-- Ask to be an expert or a verified dealer (asking again resets it to pending).
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

create or replace function public.kr_reject_role(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  update public.role_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now()
  where id = p_request and status = 'pending';
end $$;

create or replace function public.kr_revoke_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  if p_user = auth.uid() and p_role = 'ADMIN' then raise exception 'You cannot remove your own admin role'; end if;
  delete from public.staff_roles where user_id = p_user and role = p_role;
end $$;

-- First admin. Run from the SQL Editor only (not callable from the website).
create or replace function public.kr_make_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then return 'No account with that email: create it on the website first.'; end if;
  insert into public.staff_roles (user_id, role) values (uid, 'ADMIN') on conflict do nothing;
  return 'Done: ' || p_email || ' is now a KashRoot admin.';
end $$;
revoke execute on function public.kr_make_admin(text) from public, anon, authenticated;

-- ───────────────────────── advisory ─────────────────────────
create table if not exists public.advisory_requests (
  id             uuid primary key default gen_random_uuid(),
  farmer_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  farmer_name    text not null check (char_length(farmer_name) between 1 and 80),
  farmer_phone   text check (char_length(farmer_phone) <= 20),
  district       text check (char_length(district) <= 80),
  kind           text not null check (kind in ('question', 'soil_test', 'video_call')),
  crop           text check (char_length(crop) <= 60),
  message        text not null check (char_length(message) between 1 and 2000),
  photo          text check (photo is null or (photo like 'data:image/%' and char_length(photo) <= 600000)),
  preferred_time text check (char_length(preferred_time) <= 80),
  lang           text not null default 'en' check (lang in ('en', 'hi', 'ur', 'ks')),
  status         text not null default 'open' check (status in ('open', 'accepted', 'answered', 'closed')),
  expert_id      uuid references auth.users (id) on delete set null,
  expert_name    text check (char_length(expert_name) <= 80),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists advisory_requests_farmer on public.advisory_requests (farmer_id, created_at desc);
create index if not exists advisory_requests_status on public.advisory_requests (status, created_at desc);
alter table public.advisory_requests enable row level security;
drop trigger if exists advisory_requests_touch on public.advisory_requests;
create trigger advisory_requests_touch before update on public.advisory_requests for each row execute function public.kr_touch();

create or replace function public.kr_can_see_request(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.advisory_requests r
    where r.id = p_request
      and (r.farmer_id = auth.uid() or public.kr_has_role('EXPERT') or public.kr_has_role('ADMIN'))
  )
$$;

drop policy if exists "Farmers see theirs, experts see all" on public.advisory_requests;
create policy "Farmers see theirs, experts see all" on public.advisory_requests for select to authenticated
  using (farmer_id = auth.uid() or public.kr_has_role('EXPERT') or public.kr_has_role('ADMIN'));
drop policy if exists "Farmers open requests" on public.advisory_requests;
create policy "Farmers open requests" on public.advisory_requests for insert to authenticated
  with check (farmer_id = auth.uid() and status = 'open' and expert_id is null and expert_name is null);

create table if not exists public.advisory_messages (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.advisory_requests (id) on delete cascade,
  sender_id   uuid default auth.uid() references auth.users (id) on delete set null,
  sender_role text not null check (sender_role in ('farmer', 'expert', 'ai')),
  sender_name text check (char_length(sender_name) <= 80),
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists advisory_messages_request on public.advisory_messages (request_id, id);
alter table public.advisory_messages enable row level security;
drop policy if exists "Participants read messages" on public.advisory_messages;
create policy "Participants read messages" on public.advisory_messages for select to authenticated
  using (public.kr_can_see_request(request_id));
drop policy if exists "Participants write messages" on public.advisory_messages;
create policy "Participants write messages" on public.advisory_messages for insert to authenticated
  with check (
    sender_id = auth.uid() and (
      (sender_role in ('farmer', 'ai') and exists (select 1 from public.advisory_requests r where r.id = request_id and r.farmer_id = auth.uid()))
      or (sender_role = 'expert' and (public.kr_has_role('EXPERT') or public.kr_has_role('ADMIN')))
    )
  );

-- A reply moves the request along: expert reply → answered; farmer follow-up → open again.
create or replace function public.kr_after_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.advisory_requests r set
    status = case
      when r.status = 'closed' then r.status
      when new.sender_role = 'expert' then case when r.kind = 'video_call' and r.status = 'accepted' then 'accepted' else 'answered' end
      when new.sender_role = 'farmer' and r.status = 'answered' then 'open'
      else r.status end,
    expert_id   = coalesce(r.expert_id, case when new.sender_role = 'expert' then new.sender_id end),
    expert_name = coalesce(r.expert_name, case when new.sender_role = 'expert' then new.sender_name end)
  where r.id = new.request_id;
  return new;
end $$;
drop trigger if exists advisory_messages_after on public.advisory_messages;
create trigger advisory_messages_after after insert on public.advisory_messages for each row execute function public.kr_after_message();

-- accept (expert takes it / will join the call), close, reopen.
create or replace function public.kr_advisory_set(p_request uuid, p_action text, p_name text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.advisory_requests;
begin
  select * into r from public.advisory_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if p_action = 'accept' then
    if not (public.kr_has_role('EXPERT') or public.kr_has_role('ADMIN')) then raise exception 'Only an approved expert can accept'; end if;
    if r.status = 'closed' then raise exception 'This request is closed'; end if;
    update public.advisory_requests set status = 'accepted', expert_id = auth.uid(), expert_name = coalesce(nullif(trim(p_name), ''), expert_name) where id = p_request;
  elsif p_action = 'close' then
    if not (r.farmer_id = auth.uid() or r.expert_id = auth.uid() or public.kr_has_role('ADMIN')) then raise exception 'Not allowed'; end if;
    update public.advisory_requests set status = 'closed' where id = p_request;
  elsif p_action = 'reopen' then
    if r.farmer_id <> auth.uid() then raise exception 'Not allowed'; end if;
    update public.advisory_requests set status = 'open' where id = p_request;
  else
    raise exception 'Unknown action';
  end if;
end $$;

-- Video-call signalling (WebRTC offer/answer/ICE), read by polling.
create table if not exists public.call_signals (
  id         bigint generated always as identity primary key,
  request_id uuid not null references public.advisory_requests (id) on delete cascade,
  sender_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('join', 'offer', 'answer', 'ice', 'bye')),
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists call_signals_request on public.call_signals (request_id, id);
alter table public.call_signals enable row level security;
drop policy if exists "Call participants read signals" on public.call_signals;
create policy "Call participants read signals" on public.call_signals for select to authenticated
  using (public.kr_can_see_request(request_id));
drop policy if exists "Call participants send signals" on public.call_signals;
create policy "Call participants send signals" on public.call_signals for insert to authenticated
  with check (sender_id = auth.uid() and public.kr_can_see_request(request_id) and octet_length(coalesce(payload::text, '')) <= 20000);

-- ───────────────────────── payout details ─────────────────────────
create table if not exists public.payout_accounts (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  account_name   text not null check (char_length(account_name) between 2 and 80),
  upi_id         text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z]{2,64}$'),
  account_number text check (account_number is null or account_number ~ '^[0-9]{6,20}$'),
  ifsc           text check (ifsc is null or ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name      text check (char_length(bank_name) <= 80),
  updated_at     timestamptz not null default now(),
  check (upi_id is not null or (account_number is not null and ifsc is not null))
);
alter table public.payout_accounts enable row level security;
drop trigger if exists payout_accounts_touch on public.payout_accounts;
create trigger payout_accounts_touch before update on public.payout_accounts for each row execute function public.kr_touch();
drop policy if exists "Own payout details" on public.payout_accounts;
create policy "Own payout details" on public.payout_accounts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── rentals ─────────────────────────
create table if not exists public.rental_listings (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('cold_store', 'machinery')),
  title       text not null check (char_length(title) between 2 and 100),
  owner_name  text not null check (char_length(owner_name) between 1 and 80),
  phone       text not null check (char_length(phone) between 6 and 20),
  district    text not null check (char_length(district) between 2 and 80),
  address     text check (char_length(address) <= 200),
  unit        text not null check (unit in ('box_month', 'day', 'hour')),
  capacity    integer not null check (capacity between 1 and 10000000),
  available   integer not null check (available >= 0),
  rate        numeric(12, 2) not null check (rate >= 0),
  min_units   integer not null default 1 check (min_units >= 1),
  temperature text check (char_length(temperature) <= 40),
  details     text check (char_length(details) <= 1000),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (available <= capacity)
);
create index if not exists rental_listings_kind on public.rental_listings (kind, district) where active;
alter table public.rental_listings enable row level security;
drop trigger if exists rental_listings_touch on public.rental_listings;
create trigger rental_listings_touch before update on public.rental_listings for each row execute function public.kr_touch();
drop policy if exists "Anyone browses active listings" on public.rental_listings;
create policy "Anyone browses active listings" on public.rental_listings for select
  using (active or owner_id = auth.uid());
drop policy if exists "Owners add listings" on public.rental_listings;
create policy "Owners add listings" on public.rental_listings for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "Owners edit listings" on public.rental_listings;
create policy "Owners edit listings" on public.rental_listings for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "Owners remove listings" on public.rental_listings;
create policy "Owners remove listings" on public.rental_listings for delete to authenticated using (owner_id = auth.uid());

create table if not exists public.rental_bookings (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.rental_listings (id) on delete cascade,
  owner_id     uuid references auth.users (id) on delete cascade,
  renter_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  renter_name  text not null check (char_length(renter_name) between 1 and 80),
  renter_phone text not null check (char_length(renter_phone) between 6 and 20),
  units        integer not null check (units >= 1),
  duration     integer not null check (duration between 1 and 365),
  start_date   date not null,
  amount       numeric(12, 2) not null default 0,
  payment_ref  text check (payment_ref is null or payment_ref ~ '^[A-Za-z0-9]{6,30}$'),
  status       text not null default 'requested' check (status in ('requested', 'paid', 'confirmed', 'rejected', 'cancelled', 'completed')),
  owner_note   text check (char_length(owner_note) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists rental_bookings_renter on public.rental_bookings (renter_id, created_at desc);
create index if not exists rental_bookings_owner on public.rental_bookings (owner_id, created_at desc);
alter table public.rental_bookings enable row level security;
drop trigger if exists rental_bookings_touch on public.rental_bookings;
create trigger rental_bookings_touch before update on public.rental_bookings for each row execute function public.kr_touch();

-- Price and owner always come from the listing, never from the browser.
create or replace function public.kr_before_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.rental_listings;
begin
  select * into l from public.rental_listings where id = new.listing_id;
  if not found or not l.active then raise exception 'This listing is not available'; end if;
  if l.owner_id = new.renter_id then raise exception 'You cannot book your own listing'; end if;
  if new.units < l.min_units then raise exception 'Minimum booking is % %', l.min_units, case when l.unit = 'box_month' then 'boxes' else 'units' end; end if;
  if new.units > l.available then raise exception 'Only % available right now', l.available; end if;
  if new.status not in ('requested', 'paid') then raise exception 'New bookings start as requested or paid'; end if;
  if new.status = 'paid' and new.payment_ref is null then raise exception 'Enter the UPI / bank reference number of your payment'; end if;
  new.owner_id := l.owner_id;
  new.amount := round(l.rate * new.units * new.duration, 2);
  new.owner_note := null;
  return new;
end $$;
drop trigger if exists rental_bookings_before on public.rental_bookings;
create trigger rental_bookings_before before insert on public.rental_bookings for each row execute function public.kr_before_booking();

drop policy if exists "Renters and owners see bookings" on public.rental_bookings;
create policy "Renters and owners see bookings" on public.rental_bookings for select to authenticated
  using (renter_id = auth.uid() or owner_id = auth.uid());
drop policy if exists "Renters request bookings" on public.rental_bookings;
create policy "Renters request bookings" on public.rental_bookings for insert to authenticated
  with check (renter_id = auth.uid());

-- renter: pay, cancel · owner: confirm (holds the space), reject, complete (frees it)
create or replace function public.kr_booking_action(p_booking uuid, p_action text, p_ref text default null, p_note text default null)
returns public.rental_bookings language plpgsql security definer set search_path = public as $$
declare b public.rental_bookings; l public.rental_listings;
begin
  select * into b from public.rental_bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  select * into l from public.rental_listings where id = b.listing_id for update;
  if p_action = 'pay' then
    if b.renter_id <> auth.uid() then raise exception 'Not your booking'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking can no longer be paid'; end if;
    if p_ref is null or p_ref !~ '^[A-Za-z0-9]{6,30}$' then raise exception 'Enter the 12-digit UPI reference (UTR) from your payment app'; end if;
    update public.rental_bookings set status = 'paid', payment_ref = p_ref where id = p_booking returning * into b;
  elsif p_action = 'cancel' then
    if b.renter_id <> auth.uid() then raise exception 'Not your booking'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'Only bookings not yet confirmed can be cancelled'; end if;
    update public.rental_bookings set status = 'cancelled' where id = p_booking returning * into b;
  elsif p_action = 'confirm' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can confirm'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking is already %', b.status; end if;
    if l.available < b.units then raise exception 'Not enough space left: % available', l.available; end if;
    update public.rental_listings set available = available - b.units where id = l.id;
    update public.rental_bookings set status = 'confirmed', owner_note = left(p_note, 300) where id = p_booking returning * into b;
  elsif p_action = 'reject' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can reject'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking is already %', b.status; end if;
    update public.rental_bookings set status = 'rejected', owner_note = left(p_note, 300) where id = p_booking returning * into b;
  elsif p_action = 'complete' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can close a booking'; end if;
    if b.status <> 'confirmed' then raise exception 'Only confirmed bookings can be completed'; end if;
    update public.rental_listings set available = least(capacity, available + b.units) where id = l.id;
    update public.rental_bookings set status = 'completed' where id = p_booking returning * into b;
  else
    raise exception 'Unknown action';
  end if;
  return b;
end $$;

-- ───────────────────────── marketplace ─────────────────────────
create table if not exists public.market_listings (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seller_name text not null check (char_length(seller_name) between 1 and 80),
  phone       text not null check (char_length(phone) between 6 and 20),
  district    text not null check (char_length(district) between 2 and 80),
  category    text not null check (category in ('produce', 'supplies')),
  product     text not null check (char_length(product) between 2 and 80),
  variety     text check (char_length(variety) <= 60),
  grade       text check (char_length(grade) <= 30),
  unit        text not null check (unit in ('kg', 'box', 'quintal', 'bag', 'litre', 'piece')),
  price       numeric(12, 2) not null check (price > 0),
  quantity    numeric(12, 2) not null check (quantity >= 0),
  details     text check (char_length(details) <= 1000),
  photo       text check (photo is null or (photo like 'data:image/%' and char_length(photo) <= 600000)),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.market_listings add column if not exists subcategory text check (char_length(subcategory) <= 40);
create index if not exists market_listings_product on public.market_listings (category, lower(product)) where active;

-- Which sellers KashRoot has verified (dealer or admin), for the badge on listings.
create or replace function public.kr_verified_sellers(p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct user_id from public.staff_roles where user_id = any(p_ids) and role in ('DEALER', 'ADMIN')
$$;
alter table public.market_listings enable row level security;
drop trigger if exists market_listings_touch on public.market_listings;
create trigger market_listings_touch before update on public.market_listings for each row execute function public.kr_touch();
drop policy if exists "Anyone browses market listings" on public.market_listings;
create policy "Anyone browses market listings" on public.market_listings for select using (active or seller_id = auth.uid());
drop policy if exists "Sellers add listings" on public.market_listings;
create policy "Sellers add listings" on public.market_listings for insert to authenticated with check (seller_id = auth.uid());
drop policy if exists "Sellers edit listings" on public.market_listings;
create policy "Sellers edit listings" on public.market_listings for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());
drop policy if exists "Sellers remove listings" on public.market_listings;
create policy "Sellers remove listings" on public.market_listings for delete to authenticated using (seller_id = auth.uid());

create table if not exists public.market_orders (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid references public.market_listings (id) on delete set null,
  seller_id        uuid references auth.users (id) on delete cascade,
  buyer_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  buyer_name       text not null check (char_length(buyer_name) between 1 and 80),
  buyer_phone      text not null check (char_length(buyer_phone) between 6 and 20),
  delivery_address text not null check (char_length(delivery_address) between 5 and 300),
  product          text,
  unit             text,
  quantity         numeric(12, 2) not null check (quantity > 0),
  unit_price       numeric(12, 2),
  amount           numeric(12, 2) not null default 0,
  payment_ref      text check (payment_ref is null or payment_ref ~ '^[A-Za-z0-9]{6,30}$'),
  status           text not null default 'placed' check (status in ('placed', 'accepted', 'shipped', 'delivered', 'paid', 'completed', 'cancelled', 'rejected', 'disputed')),
  seller_note      text check (char_length(seller_note) <= 300),
  buyer_note       text check (char_length(buyer_note) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists market_orders_buyer on public.market_orders (buyer_id, created_at desc);
create index if not exists market_orders_seller on public.market_orders (seller_id, created_at desc);
alter table public.market_orders enable row level security;
drop trigger if exists market_orders_touch on public.market_orders;
create trigger market_orders_touch before update on public.market_orders for each row execute function public.kr_touch();

create or replace function public.kr_before_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.market_listings;
begin
  select * into l from public.market_listings where id = new.listing_id;
  if not found or not l.active then raise exception 'This product is no longer listed'; end if;
  if l.seller_id = new.buyer_id then raise exception 'You cannot order your own product'; end if;
  if new.quantity > l.quantity then raise exception 'Only % % available', l.quantity, l.unit; end if;
  new.seller_id := l.seller_id;
  new.product := l.product || coalesce(' · ' || l.variety, '');
  new.unit := l.unit;
  new.unit_price := l.price;
  new.amount := round(l.price * new.quantity, 2);
  new.status := 'placed';
  new.payment_ref := null;
  new.seller_note := null;
  return new;
end $$;
drop trigger if exists market_orders_before on public.market_orders;
create trigger market_orders_before before insert on public.market_orders for each row execute function public.kr_before_order();

drop policy if exists "Buyers and sellers see orders" on public.market_orders;
create policy "Buyers and sellers see orders" on public.market_orders for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());
-- A buyer's "Report a problem" reaches KashRoot: admins see disputed orders.
drop policy if exists "Admins see reported orders" on public.market_orders;
create policy "Admins see reported orders" on public.market_orders for select to authenticated
  using (status = 'disputed' and public.kr_has_role('ADMIN'));
drop policy if exists "Buyers place orders" on public.market_orders;
create policy "Buyers place orders" on public.market_orders for insert to authenticated with check (buyer_id = auth.uid());

-- Pay after delivery: seller accept → ship; buyer confirms delivery → pays the seller
-- directly by UPI and enters the reference → seller confirms the money arrived.
create or replace function public.kr_order_action(p_order uuid, p_action text, p_ref text default null, p_note text default null)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders; l public.market_listings;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if p_action in ('accept', 'reject', 'ship', 'confirm_payment') then
    if o.seller_id <> auth.uid() then raise exception 'Only the seller can do this'; end if;
  elsif p_action in ('cancel', 'delivered', 'pay', 'dispute') then
    if o.buyer_id <> auth.uid() then raise exception 'Only the buyer can do this'; end if;
  else
    raise exception 'Unknown action';
  end if;

  if p_action = 'accept' then
    if o.status <> 'placed' then raise exception 'Order is already %', o.status; end if;
    select * into l from public.market_listings where id = o.listing_id for update;
    if found then
      if l.quantity < o.quantity then raise exception 'Only % % left in stock', l.quantity, l.unit; end if;
      update public.market_listings set quantity = quantity - o.quantity where id = l.id;
    end if;
    update public.market_orders set status = 'accepted', seller_note = left(p_note, 300) where id = p_order returning * into o;
  elsif p_action = 'reject' then
    if o.status <> 'placed' then raise exception 'Order is already %', o.status; end if;
    update public.market_orders set status = 'rejected', seller_note = left(p_note, 300) where id = p_order returning * into o;
  elsif p_action = 'ship' then
    if o.status <> 'accepted' then raise exception 'Accept the order first'; end if;
    update public.market_orders set status = 'shipped', seller_note = coalesce(left(p_note, 300), seller_note) where id = p_order returning * into o;
  elsif p_action = 'cancel' then
    if o.status <> 'placed' then raise exception 'The seller has already accepted this order'; end if;
    update public.market_orders set status = 'cancelled' where id = p_order returning * into o;
  elsif p_action = 'delivered' then
    if o.status not in ('accepted', 'shipped') then raise exception 'Order is %', o.status; end if;
    update public.market_orders set status = 'delivered' where id = p_order returning * into o;
  elsif p_action = 'pay' then
    if o.status not in ('delivered', 'paid') then raise exception 'Confirm the delivery first'; end if;
    if p_ref is null or p_ref !~ '^[A-Za-z0-9]{6,30}$' then raise exception 'Enter the 12-digit UPI reference (UTR) from your payment app'; end if;
    update public.market_orders set status = 'paid', payment_ref = p_ref where id = p_order returning * into o;
  elsif p_action = 'dispute' then
    if o.status in ('completed', 'cancelled', 'rejected') then raise exception 'Order is %', o.status; end if;
    update public.market_orders set status = 'disputed', buyer_note = left(p_note, 300) where id = p_order returning * into o;
  elsif p_action = 'confirm_payment' then
    if o.status <> 'paid' then raise exception 'The buyer has not marked this order paid yet'; end if;
    update public.market_orders set status = 'completed' where id = p_order returning * into o;
  end if;
  return o;
end $$;

-- Who to pay: the owner's / seller's payout details, only for a renter or buyer
-- with a live booking or order with them.
create or replace function public.kr_payment_details(p_kind text, p_id uuid)
returns table (account_name text, upi_id text, account_number text, ifsc text, bank_name text)
language plpgsql stable security definer set search_path = public as $$
declare payee uuid;
begin
  if p_kind = 'booking' then
    select owner_id into payee from public.rental_bookings where id = p_id and renter_id = auth.uid() and status in ('requested', 'paid', 'confirmed');
  elsif p_kind = 'order' then
    select seller_id into payee from public.market_orders where id = p_id and buyer_id = auth.uid() and status in ('accepted', 'shipped', 'delivered', 'paid');
  end if;
  if payee is null then return; end if;
  return query select a.account_name, a.upi_id, a.account_number, a.ifsc, a.bank_name from public.payout_accounts a where a.user_id = payee;
end $$;

-- ───────────────────────── consignments ─────────────────────────
create table if not exists public.consignments (
  code         text primary key default ('KR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_no   text check (char_length(vehicle_no) <= 20),
  driver_name  text check (char_length(driver_name) <= 80),
  driver_phone text check (char_length(driver_phone) <= 20),
  origin       text not null check (char_length(origin) between 2 and 120),
  destination  text not null check (char_length(destination) between 2 and 120),
  cargo        text check (char_length(cargo) <= 120),
  status       text not null default 'booked' check (status in ('booked', 'in_transit', 'delivered', 'cancelled')),
  driver_token text not null default replace(gen_random_uuid()::text, '-', ''),
  last_lat     double precision,
  last_lng     double precision,
  last_accuracy real,
  last_seen    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.consignments enable row level security;
drop trigger if exists consignments_touch on public.consignments;
create trigger consignments_touch before update on public.consignments for each row execute function public.kr_touch();
drop policy if exists "Owners manage consignments" on public.consignments;
create policy "Owners manage consignments" on public.consignments for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists public.consignment_points (
  id    bigint generated always as identity primary key,
  code  text not null references public.consignments (code) on delete cascade,
  lat   double precision not null,
  lng   double precision not null,
  at    timestamptz not null default now()
);
create index if not exists consignment_points_code on public.consignment_points (code, id desc);
alter table public.consignment_points enable row level security;
-- No direct access: read through kr_track, written by kr_driver_ping.

-- Anyone with the code sees where the load is (never the driver link).
create or replace function public.kr_track(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when c.code is null then null else jsonb_build_object(
    'code', c.code, 'vehicle_no', c.vehicle_no, 'driver_name', c.driver_name, 'driver_phone', c.driver_phone,
    'origin', c.origin, 'destination', c.destination, 'cargo', c.cargo, 'status', c.status,
    'last_lat', c.last_lat, 'last_lng', c.last_lng, 'last_accuracy', c.last_accuracy, 'last_seen', c.last_seen,
    'created_at', c.created_at,
    'trail', coalesce((select jsonb_agg(jsonb_build_object('lat', p.lat, 'lng', p.lng, 'at', p.at) order by p.id)
                       from (select * from public.consignment_points where code = c.code order by id desc limit 60) p), '[]'::jsonb)
  ) end
  from (select 1) one left join public.consignments c on c.code = upper(trim(p_code))
$$;

create or replace function public.kr_driver_view(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', code, 'origin', origin, 'destination', destination, 'cargo', cargo,
                            'vehicle_no', vehicle_no, 'status', status, 'last_seen', last_seen)
  from public.consignments where driver_token = p_token
$$;

create or replace function public.kr_driver_ping(p_token text, p_lat double precision, p_lng double precision, p_accuracy real default null)
returns text language plpgsql security definer set search_path = public as $$
declare c public.consignments;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Bad location'; end if;
  select * into c from public.consignments where driver_token = p_token for update;
  if not found then raise exception 'This driver link is not valid'; end if;
  if c.status in ('delivered', 'cancelled') then return c.status; end if;
  -- At most one stored point every 20 seconds.
  if c.last_seen is not null and c.last_seen > now() - interval '20 seconds' then return c.status; end if;
  update public.consignments set last_lat = p_lat, last_lng = p_lng, last_accuracy = p_accuracy, last_seen = now(),
    status = case when status = 'booked' then 'in_transit' else status end
  where code = c.code;
  insert into public.consignment_points (code, lat, lng) values (c.code, p_lat, p_lng);
  delete from public.consignment_points where code = c.code and id not in (select id from public.consignment_points where code = c.code order by id desc limit 500);
  return 'in_transit';
end $$;

create or replace function public.kr_driver_delivered(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.consignments set status = 'delivered' where driver_token = p_token and status in ('booked', 'in_transit');
  if not found then raise exception 'This driver link is not valid'; end if;
end $$;

-- ───────────────────────── orchard ─────────────────────────
create table if not exists public.orchard_blocks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  variety    text check (char_length(variety) <= 60),
  place      text check (char_length(place) <= 120),
  lat        double precision check (lat between -90 and 90),
  lng        double precision check (lng between -180 and 180),
  wet_bias   smallint not null default 0 check (wet_bias between -6 and 12),
  created_at timestamptz not null default now()
);
alter table public.orchard_blocks enable row level security;
drop policy if exists "Own orchard blocks" on public.orchard_blocks;
create policy "Own orchard blocks" on public.orchard_blocks for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table if not exists public.spray_logs (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block_id   uuid references public.orchard_blocks (id) on delete cascade,
  block_name text not null check (char_length(block_name) between 1 and 60),
  product    text not null check (char_length(product) between 1 and 80),
  phi_days   integer not null check (phi_days between 0 and 180),
  sprayed_on date not null,
  note       text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
alter table public.spray_logs enable row level security;
drop policy if exists "Own spray logs" on public.spray_logs;
create policy "Own spray logs" on public.spray_logs for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ───────────────────────── fertiliser / pesticide registry ─────────────────────────
-- (fertilizer_batches comes from 20261010000000_fertilizer_batches.sql)
alter table public.fertilizer_batches add column if not exists product_type text not null default 'fertilizer';
alter table public.fertilizer_batches add column if not exists registration_no text;
alter table public.fertilizer_batches add column if not exists dealer_name text;
alter table public.fertilizer_batches add column if not exists dealer_licence text;
alter table public.fertilizer_batches add column if not exists dealer_district text;
do $$ begin
  alter table public.fertilizer_batches add constraint fertilizer_batches_type check (product_type in ('fertilizer', 'pesticide', 'seed', 'other'));
exception when duplicate_object then null; end $$;

-- Any signed-in dealer can register; farmers see whether KashRoot has verified that dealer.
drop policy if exists "Approved dealers register batches" on public.fertilizer_batches;
drop policy if exists "Signed-in dealers register batches" on public.fertilizer_batches;
create policy "Signed-in dealers register batches" on public.fertilizer_batches for insert to authenticated
  with check (registered_by = auth.uid());
drop policy if exists "Dealers remove their own batches" on public.fertilizer_batches;
create policy "Dealers remove their own batches" on public.fertilizer_batches for delete to authenticated
  using (registered_by = auth.uid());

create table if not exists public.batch_reports (
  id          bigint generated always as identity primary key,
  batch_code  text not null check (char_length(batch_code) between 1 and 40),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note        text not null check (char_length(note) between 3 and 500),
  created_at  timestamptz not null default now()
);
alter table public.batch_reports enable row level security;
drop policy if exists "Report a suspicious batch" on public.batch_reports;
create policy "Report a suspicious batch" on public.batch_reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "Own reports, admins see all" on public.batch_reports;
create policy "Own reports, admins see all" on public.batch_reports for select to authenticated
  using (reporter_id = auth.uid() or public.kr_has_role('ADMIN'));

-- Batch lookup for farmers: the batch plus whether KashRoot has verified the dealer.
create or replace function public.kr_check_batch(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(b) - 'registered_by' || jsonb_build_object(
    'dealer_verified',
      exists (select 1 from public.staff_roles s where s.user_id = b.registered_by and s.role in ('DEALER', 'ADMIN'))
      or exists (select 1 from auth.users u where u.id = b.registered_by and u.raw_app_meta_data ->> 'role' in ('DEALER', 'MANUFACTURER', 'ADMIN')),
    'reports', (select count(*) from public.batch_reports r where r.batch_code = b.batch_code)
  )
  from public.fertilizer_batches b where b.batch_code = upper(trim(p_code))
$$;

-- ───────────────────────── admin numbers ─────────────────────────
-- Counts across the platform for the Admin portal (admins only).
create or replace function public.kr_admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only KashRoot admins can see this'; end if;
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
revoke execute on function public.kr_admin_stats() from public, anon;
grant execute on function public.kr_admin_stats() to authenticated;

-- ───────────────────────── grants ─────────────────────────
grant select on public.rental_listings, public.market_listings, public.fertilizer_batches to anon;
grant select, insert, update, delete on
  public.staff_roles, public.role_requests, public.advisory_requests, public.advisory_messages, public.call_signals,
  public.payout_accounts, public.rental_listings, public.rental_bookings, public.market_listings, public.market_orders,
  public.consignments, public.orchard_blocks, public.spray_logs, public.fertilizer_batches, public.batch_reports
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.kr_track(text), public.kr_driver_view(text), public.kr_driver_ping(text, double precision, double precision, real),
  public.kr_driver_delivered(text), public.kr_check_batch(text), public.kr_verified_sellers(uuid[]) to anon, authenticated;

-- ════════ 20261012000000_mandi_rates.sql ════════
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

-- ════════ 20261013000000_contributors.sql ════════
-- KashRoot: checking the people who add information (mandi reporters,
-- agronomists), checking each mandi rate for accuracy, and recording every
-- accepted contribution so contributors can be paid for their work.
--
-- Run after 20261012000000_mandi_rates.sql. Safe to run again.
--
--   1. Proof with an application: the mandi / workplace, a licence or
--      registration number and a photo of a licence or ID card. Only the
--      applicant and admins can see it. The admin also phones the applicant.
--   2. Each mandi rate is checked: other people mark it Correct or Wrong;
--      two reporters posting the same rate confirm each other; an admin
--      decides disputed rates. Rates marked wrong are not shown to farmers.
--   3. contributions: one row per rate posted or farmer request answered,
--      pending → accepted / rejected. pay_rates holds ₹ per accepted
--      contribution (0 = not decided yet); admins mark people paid.

-- ───────────────────────── 1. proof with an application ─────────────────────────
alter table public.role_requests add column if not exists place text check (char_length(place) <= 120);
alter table public.role_requests add column if not exists licence text check (char_length(licence) <= 80);
alter table public.role_requests add column if not exists id_photo text check (id_photo is null or (id_photo like 'data:image/%' and char_length(id_photo) <= 600000));

-- Called right after kr_request_role, for the caller's own pending application.
create or replace function public.kr_role_proof(p_role text, p_place text, p_licence text, p_photo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_photo is not null and (p_photo not like 'data:image/%' or char_length(p_photo) > 600000) then
    raise exception 'The photo is too large. Take it again a little further away.';
  end if;
  update public.role_requests
     set place = left(nullif(trim(p_place), ''), 120), licence = left(nullif(trim(p_licence), ''), 80), id_photo = p_photo
   where user_id = auth.uid() and role = p_role and status = 'pending';
  if not found then raise exception 'Apply first'; end if;
end $$;

-- ───────────────────────── 2. checking each mandi rate ─────────────────────────
alter table public.mandi_rates add column if not exists status text not null default 'pending';
alter table public.mandi_rates drop constraint if exists mandi_rates_status_check;
alter table public.mandi_rates add constraint mandi_rates_status_check check (status in ('pending', 'verified', 'disputed', 'wrong'));
alter table public.mandi_rates add column if not exists final boolean not null default false; -- decided by an admin
alter table public.mandi_rates add column if not exists confirms int not null default 0;
alter table public.mandi_rates add column if not exists reports int not null default 0;
alter table public.mandi_rates add column if not exists checked_by uuid references auth.users (id) on delete set null;
alter table public.mandi_rates add column if not exists checked_at timestamptz;

create table if not exists public.mandi_rate_checks (
  rate_id    uuid not null references public.mandi_rates (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  verdict    text not null check (verdict in ('correct', 'wrong')),
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  primary key (rate_id, user_id)
);
alter table public.mandi_rate_checks enable row level security;
drop policy if exists "Own checks, checks on own rates, admins all" on public.mandi_rate_checks;
create policy "Own checks, checks on own rates, admins all" on public.mandi_rate_checks for select to authenticated
  using (
    user_id = auth.uid() or public.kr_has_role('ADMIN')
    or exists (select 1 from public.mandi_rates r where r.id = rate_id and r.posted_by = auth.uid())
  );
grant select on public.mandi_rate_checks to authenticated;

-- The same rate from two different reporters (same mandi, crop, variety,
-- grade, unit and day). Within 15 % they confirm each other; more than 30 %
-- apart, both need an admin.
create or replace function public.kr_rate_same(a public.mandi_rates, b public.mandi_rates) returns boolean
language sql immutable as $$
  select a.id <> b.id and a.posted_by <> b.posted_by and a.rate_date = b.rate_date and a.unit = b.unit
     and lower(trim(a.mandi)) = lower(trim(b.mandi)) and lower(trim(a.commodity)) = lower(trim(b.commodity))
     and lower(coalesce(trim(a.variety), '')) = lower(coalesce(trim(b.variety), ''))
     and lower(coalesce(trim(a.grade), '')) = lower(coalesce(trim(b.grade), ''))
     and coalesce(a.box_kg, 0) = coalesce(b.box_kg, 0)
$$;

-- Works out a rate's status from the checks, unless an admin decided it.
create or replace function public.kr_rate_recount(p_rate uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.mandi_rates;
  c int; w int; strong int; agree boolean; clash boolean;
begin
  select * into r from public.mandi_rates where id = p_rate;
  if not found or r.final then return; end if;
  select count(*) filter (where k.verdict = 'correct'),
         count(*) filter (where k.verdict = 'wrong'),
         count(*) filter (where k.verdict = 'correct' and exists (select 1 from public.staff_roles s where s.user_id = k.user_id and s.role in ('REPORTER', 'ADMIN')))
    into c, w, strong
    from public.mandi_rate_checks k where k.rate_id = p_rate;
  select coalesce(bool_or(abs(o.modal_price - r.modal_price) <= 0.15 * greatest(o.modal_price, r.modal_price)), false),
         coalesce(bool_or(abs(o.modal_price - r.modal_price) > 0.30 * greatest(o.modal_price, r.modal_price)), false)
    into agree, clash
    from public.mandi_rates o where public.kr_rate_same(o, r) and o.status <> 'wrong';
  perform set_config('kr.trusted', 'on', true);
  update public.mandi_rates set
    confirms = c,
    reports = w,
    status = case when w > 0 or clash then 'disputed' when strong >= 1 or c >= 2 or agree then 'verified' else 'pending' end
  where id = p_rate;
  perform set_config('kr.trusted', 'off', true);
end $$;
revoke execute on function public.kr_rate_recount(uuid) from public, anon, authenticated;

-- A new rate always starts unchecked; an edit by its reporter cannot set the
-- check fields, and changing the price starts the checking again.
create or replace function public.kr_rate_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('kr.trusted', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.final := false; new.confirms := 0; new.reports := 0; new.checked_by := null; new.checked_at := null;
    return new;
  end if;
  new.status := old.status; new.final := old.final; new.confirms := old.confirms; new.reports := old.reports;
  new.checked_by := old.checked_by; new.checked_at := old.checked_at; new.posted_by := old.posted_by;
  if (new.mandi, new.commodity, new.variety, new.grade, new.unit, new.box_kg, new.min_price, new.modal_price, new.max_price)
     is distinct from (old.mandi, old.commodity, old.variety, old.grade, old.unit, old.box_kg, old.min_price, old.modal_price, old.max_price) then
    new.status := 'pending'; new.final := false; new.confirms := 0; new.reports := 0; new.checked_by := null; new.checked_at := null;
    delete from public.mandi_rate_checks where rate_id = old.id;
  end if;
  return new;
end $$;
drop trigger if exists mandi_rates_before on public.mandi_rates;
create trigger mandi_rates_before before insert or update on public.mandi_rates for each row execute function public.kr_rate_before();

-- Keeps the reporter's contribution in step with the rate, and re-checks
-- rates for the same mandi and crop.
create or replace function public.kr_rate_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  if tg_op = 'DELETE' then
    delete from public.contributions where kind = 'mandi_rate' and ref_id = old.id::text and paid_at is null;
    for o in select m.id from public.mandi_rates m where public.kr_rate_same(m, old) loop
      perform public.kr_rate_recount(o.id);
    end loop;
    return old;
  end if;
  insert into public.contributions (user_id, kind, ref_id, title, status, decided_at)
  values (
    new.posted_by, 'mandi_rate', new.id::text,
    left(format('%s%s · %s · ₹%s per %s · %s', new.commodity, coalesce(' ' || new.variety, ''), new.mandi, new.modal_price, new.unit, to_char(new.rate_date, 'DD Mon')), 160),
    case new.status when 'verified' then 'accepted' when 'wrong' then 'rejected' else 'pending' end,
    case when new.status in ('verified', 'wrong') then now() end
  )
  on conflict (kind, ref_id, user_id) do update
    set status = excluded.status, title = excluded.title, decided_at = excluded.decided_at, final = new.final
    where public.contributions.paid_at is null;
  if current_setting('kr.trusted', true) is distinct from 'on' then
    perform public.kr_rate_recount(new.id);
    for o in select m.id from public.mandi_rates m where public.kr_rate_same(m, new) loop
      perform public.kr_rate_recount(o.id);
    end loop;
  end if;
  return new;
end $$;

-- Anyone signed in (another trader, a farmer back from the mandi) says
-- whether a rate is right. Not on your own rate.
create or replace function public.kr_check_rate(p_rate uuid, p_correct boolean, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare r public.mandi_rates;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into r from public.mandi_rates where id = p_rate;
  if not found then raise exception 'Rate not found'; end if;
  if r.posted_by = auth.uid() then raise exception 'You cannot check your own rate'; end if;
  insert into public.mandi_rate_checks (rate_id, user_id, verdict, note)
  values (p_rate, auth.uid(), case when p_correct then 'correct' else 'wrong' end, left(nullif(trim(p_note), ''), 200))
  on conflict (rate_id, user_id) do update set verdict = excluded.verdict, note = excluded.note, created_at = now();
  perform public.kr_rate_recount(p_rate);
  return (select status from public.mandi_rates where id = p_rate);
end $$;

-- An admin's final word on a rate.
create or replace function public.kr_decide_rate(p_rate uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  perform set_config('kr.trusted', 'on', true);
  update public.mandi_rates
     set status = case when p_ok then 'verified' else 'wrong' end, final = true, checked_by = auth.uid(), checked_at = now()
   where id = p_rate;
  get diagnostics n = row_count;
  perform set_config('kr.trusted', 'off', true);
  if n = 0 then raise exception 'Rate not found'; end if;
end $$;

-- ───────────────────────── 3. contributions and pay ─────────────────────────
create table if not exists public.contributions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('mandi_rate', 'answer', 'soil_test', 'video_call')),
  ref_id      text not null,
  title       text check (char_length(title) <= 160),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  final       boolean not null default false, -- decided by an admin
  decided_at  timestamptz,
  paid_at     timestamptz,
  paid_amount numeric check (paid_amount >= 0),
  paid_ref    text check (char_length(paid_ref) <= 80),
  created_at  timestamptz not null default now(),
  unique (kind, ref_id, user_id)
);
create index if not exists contributions_user on public.contributions (user_id, created_at desc);
create index if not exists contributions_status on public.contributions (status, created_at desc);
alter table public.contributions enable row level security;
drop policy if exists "Own contributions, admins all" on public.contributions;
create policy "Own contributions, admins all" on public.contributions for select to authenticated
  using (user_id = auth.uid() or public.kr_has_role('ADMIN'));
grant select on public.contributions to authenticated;

-- The trigger above writes contributions, so it is created after the table.
drop trigger if exists mandi_rates_after on public.mandi_rates;
create trigger mandi_rates_after after insert or update or delete on public.mandi_rates for each row execute function public.kr_rate_after();

-- Rates posted before this file was run count too.
insert into public.contributions (user_id, kind, ref_id, title)
select r.posted_by, 'mandi_rate', r.id::text, left(format('%s%s · %s · ₹%s per %s · %s', r.commodity, coalesce(' ' || r.variety, ''), r.mandi, r.modal_price, r.unit, to_char(r.rate_date, 'DD Mon')), 160)
from public.mandi_rates r
on conflict (kind, ref_id, user_id) do nothing;

-- Farmers say whether an expert's answer helped.
alter table public.advisory_requests add column if not exists farmer_rating text;
alter table public.advisory_requests drop constraint if exists advisory_requests_farmer_rating_check;
alter table public.advisory_requests add constraint advisory_requests_farmer_rating_check check (farmer_rating in ('helpful', 'not_helpful'));

-- An expert's first reply on a request is one contribution.
create or replace function public.kr_advice_contribution() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.advisory_requests;
begin
  if new.sender_role <> 'expert' or new.sender_id is null then return new; end if;
  select * into r from public.advisory_requests where id = new.request_id;
  insert into public.contributions (user_id, kind, ref_id, title, status, decided_at)
  values (
    new.sender_id,
    case r.kind when 'question' then 'answer' else r.kind end,
    new.request_id::text,
    left(format('%s%s · %s%s', case r.kind when 'question' then 'Answer' when 'soil_test' then 'Soil test' else 'Video call' end,
                coalesce(' · ' || r.crop, ''), r.farmer_name, coalesce(', ' || r.district, '')), 160),
    case when r.farmer_rating = 'helpful' then 'accepted' else 'pending' end,
    case when r.farmer_rating = 'helpful' then now() end
  )
  on conflict (kind, ref_id, user_id) do nothing;
  return new;
end $$;
drop trigger if exists advisory_messages_contribution on public.advisory_messages;
create trigger advisory_messages_contribution after insert on public.advisory_messages for each row execute function public.kr_advice_contribution();

-- Expert replies sent before this file was run count too.
insert into public.contributions (user_id, kind, ref_id, title)
select distinct on (m.sender_id, m.request_id)
       m.sender_id, case r.kind when 'question' then 'answer' else r.kind end, m.request_id::text,
       left(format('%s%s · %s%s', case r.kind when 'question' then 'Answer' when 'soil_test' then 'Soil test' else 'Video call' end,
                   coalesce(' · ' || r.crop, ''), r.farmer_name, coalesce(', ' || r.district, '')), 160)
from public.advisory_messages m join public.advisory_requests r on r.id = m.request_id
where m.sender_role = 'expert' and m.sender_id is not null
on conflict (kind, ref_id, user_id) do nothing;

create or replace function public.kr_rate_advice(p_request uuid, p_helpful boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.advisory_requests;
begin
  select * into r from public.advisory_requests where id = p_request;
  if not found or r.farmer_id is distinct from auth.uid() then raise exception 'Only the farmer who asked can say this'; end if;
  if not exists (select 1 from public.advisory_messages m where m.request_id = p_request and m.sender_role = 'expert') then
    raise exception 'No expert has answered yet';
  end if;
  update public.advisory_requests set farmer_rating = case when p_helpful then 'helpful' else 'not_helpful' end where id = p_request;
  -- "Helped" accepts the experts' work; "did not help" leaves it for an admin.
  update public.contributions
     set status = case when p_helpful then 'accepted' else 'pending' end,
         decided_at = case when p_helpful then now() end
   where ref_id = p_request::text and kind in ('answer', 'soil_test', 'video_call') and not final and paid_at is null;
end $$;

-- An admin accepts or rejects any contribution (rates go through kr_decide_rate).
create or replace function public.kr_decide_work(p_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.contributions;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  select * into c from public.contributions where id = p_id;
  if not found then raise exception 'Not found'; end if;
  if c.paid_at is not null then raise exception 'Already paid'; end if;
  if c.kind = 'mandi_rate' then
    perform public.kr_decide_rate(c.ref_id::uuid, p_ok);
  else
    update public.contributions set status = case when p_ok then 'accepted' else 'rejected' end, final = true, decided_at = now() where id = p_id;
  end if;
end $$;

-- ₹ paid for each accepted contribution. 0 means not decided yet.
create table if not exists public.pay_rates (
  kind       text primary key check (kind in ('mandi_rate', 'answer', 'soil_test', 'video_call')),
  amount     numeric not null default 0 check (amount >= 0 and amount <= 100000),
  updated_at timestamptz not null default now()
);
insert into public.pay_rates (kind) values ('mandi_rate'), ('answer'), ('soil_test'), ('video_call') on conflict do nothing;
alter table public.pay_rates enable row level security;
drop trigger if exists pay_rates_touch on public.pay_rates;
create trigger pay_rates_touch before update on public.pay_rates for each row execute function public.kr_touch();
drop policy if exists "Everyone signed in sees pay rates" on public.pay_rates;
create policy "Everyone signed in sees pay rates" on public.pay_rates for select to authenticated using (true);
drop policy if exists "Admins set pay rates" on public.pay_rates;
create policy "Admins set pay rates" on public.pay_rates for update to authenticated
  using (public.kr_has_role('ADMIN')) with check (public.kr_has_role('ADMIN'));
grant select, update on public.pay_rates to authenticated;

-- Admin: everyone who has contributed, what is owed and where to pay.
create or replace function public.kr_contributors()
returns table (
  user_id uuid, name text, email text, phone text, roles text[],
  accepted bigint, pending bigint, rejected bigint, unpaid bigint, due numeric, paid numeric,
  upi_id text, account_number text, ifsc text, last_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
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

-- Admin: after paying someone (UPI / bank), record it. Returns the total.
create or replace function public.kr_mark_paid(p_user uuid, p_ref text) returns numeric
language plpgsql security definer set search_path = public as $$
declare total numeric;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
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

-- ════════ 20261014000000_trust_and_security.sql ════════
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

-- ════════ 20261015000000_admin_team.sql ════════
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

-- ════════ 20261016000000_admin_accounts.sql ════════
-- KashRoot: the list of accounts for the Admin portal (Admin → Accounts).
-- Who signed up, for which portal, when they joined and last signed in,
-- whether the email is confirmed and the identity checked. Admins only
-- (signed in, with the admin code entered). Passwords are never read.
-- Run after 20261015000000_admin_team.sql. Safe to run again.

-- Dropped first: a later file adds a column, and Postgres cannot change it in place.
drop function if exists public.kr_admin_accounts();
create function public.kr_admin_accounts()
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
      exists (select 1 from public.identity_checks k where k.user_id = u.id and k.aadhaar_verified_at is not null),
      exists (select 1 from public.identity_checks k where k.user_id = u.id and k.pan_verified_at is not null)
    from auth.users u
    order by coalesce(u.last_sign_in_at, u.created_at) desc
    limit 2000;
end $$;
revoke execute on function public.kr_admin_accounts() from public, anon;
grant execute on function public.kr_admin_accounts() to authenticated;

-- ════════ 20261017000000_security_log.sql ════════
-- KashRoot: security log (Admin → Security → Security log).
-- Records, automatically and without anyone being able to edit them:
--   admin code created / changed, wrong admin codes, the portal blocked after
--   wrong codes, Admin portal opened / locked, admin accounts signing in,
--   roles given or taken away, identity-check rules changed, contributors
--   marked paid. Only admins (with the code entered) can read it; nobody can
--   change or delete entries from the website. Kept for one year.
-- Run after 20261016000000_admin_accounts.sql. Safe to run again.

create table if not exists public.security_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid,
  email   text,
  event   text not null,
  detail  text
);
create index if not exists security_log_at on public.security_log (at desc);
alter table public.security_log enable row level security;
revoke all on public.security_log from anon, authenticated;
grant select on public.security_log to authenticated;
drop policy if exists security_log_admins on public.security_log;
create policy security_log_admins on public.security_log for select to authenticated using (public.kr_has_role('ADMIN'));

-- Writes one entry. `who` is the account the event is about (default: the caller).
create or replace function public.kr_log(p_event text, p_detail text default null, p_who uuid default null) returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := coalesce(p_who, auth.uid());
begin
  insert into public.security_log (user_id, email, event, detail)
  values (uid, (select email from auth.users where id = uid), left(p_event, 200), left(p_detail, 500));
  delete from public.security_log where at < now() - interval '1 year';
end $$;
revoke execute on function public.kr_log(text, text, uuid) from public, anon, authenticated;

-- Admin code and wrong codes.
create or replace function public.kr_log_admin_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.kr_log('Admin code created', null, new.user_id);
  else
    if new.code_hash is distinct from old.code_hash then perform public.kr_log('Admin code changed', null, new.user_id); end if;
    if new.failed > old.failed then perform public.kr_log('Wrong admin code', 'attempt ' || new.failed, new.user_id); end if;
    if new.locked_until is distinct from old.locked_until and new.locked_until > now() then
      perform public.kr_log('Admin portal blocked for 15 minutes', 'too many wrong codes', new.user_id);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists kr_log_admin_lock on public.admin_lock;
create trigger kr_log_admin_lock after insert or update on public.admin_lock for each row execute function public.kr_log_admin_lock();

-- Admin portal opened / locked.
create or replace function public.kr_log_admin_unlocks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.kr_log('Admin portal opened', 'with the admin code', new.user_id);
  elsif old.expires_at > now() then
    perform public.kr_log('Admin portal locked', null, old.user_id);
  end if;
  return null;
end $$;
drop trigger if exists kr_log_admin_unlocks on public.admin_unlocks;
create trigger kr_log_admin_unlocks after insert or update or delete on public.admin_unlocks for each row execute function public.kr_log_admin_unlocks();

-- Roles given and taken away (admins, agronomists, dealers, Mandi Helpers).
create or replace function public.kr_log_staff_roles() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if tg_op = 'INSERT' then
    perform public.kr_log('Role given: ' || new.role, 'to ' || coalesce((select email from auth.users where id = new.user_id), new.user_id::text), coalesce(auth.uid(), new.user_id));
  else
    perform public.kr_log('Role removed: ' || old.role, 'from ' || coalesce((select email from auth.users where id = old.user_id), old.user_id::text), coalesce(auth.uid(), old.user_id));
  end if;
  return null;
end $$;
drop trigger if exists kr_log_staff_roles on public.staff_roles;
create trigger kr_log_staff_roles after insert or delete on public.staff_roles for each row execute function public.kr_log_staff_roles();

-- Identity-check (KYC) rules. The secret itself is never written to the log.
create or replace function public.kr_log_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kyc_required is distinct from old.kyc_required or new.pan_required is distinct from old.pan_required then
    perform public.kr_log('Identity-check rules changed', 'Aadhaar required: ' || new.kyc_required || ', PAN required: ' || new.pan_required);
  end if;
  if new.kyc_secret is distinct from old.kyc_secret then perform public.kr_log('KYC server secret changed'); end if;
  return null;
end $$;
drop trigger if exists kr_log_settings on public.kr_settings;
create trigger kr_log_settings after update on public.kr_settings for each row execute function public.kr_log_settings();

-- Contributors marked paid (one entry per payment).
create or replace function public.kr_log_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; total numeric;
begin
  select count(*), coalesce(sum(nr.paid_amount), 0) into n, total
    from new_rows nr join old_rows o on o.id = nr.id
   where o.paid_at is null and nr.paid_at is not null;
  if n > 0 then perform public.kr_log('Contributors marked paid', n || ' item(s), ₹' || total); end if;
  return null;
end $$;
drop trigger if exists kr_log_paid on public.contributions;
create trigger kr_log_paid after update on public.contributions referencing new table as new_rows old table as old_rows
  for each statement execute function public.kr_log_paid();

-- Admin accounts signing in (so a stolen admin password is noticed).
-- Supabase allows triggers on auth.users; if this project does not, it is skipped.
create or replace function public.kr_log_admin_sign_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at
     and exists (select 1 from public.staff_roles where user_id = new.id and role = 'ADMIN') then
    perform public.kr_log('Admin account signed in', null, new.id);
  end if;
  return null;
end $$;
do $$
begin
  drop trigger if exists kr_log_admin_sign_in on auth.users;
  create trigger kr_log_admin_sign_in after update of last_sign_in_at on auth.users for each row execute function public.kr_log_admin_sign_in();
exception when others then
  raise notice 'Admin sign-in logging skipped: %', sqlerrm;
end $$;

-- ════════ 20261018000000_accounts_last_active.sql ════════
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


-- ════════ 20261020000000_cold_store_map.sql ════════
-- KashRoot: the cold store map — farmers choose their own place in the store,
-- the way a seat is chosen when booking a flight.
--   cold_chambers       each chamber of a cold store: rows × columns of places
--                       (bays / pallet spaces), each holding a number of boxes.
--                       Places that cannot be used (pillars, doors, the aisle)
--                       are marked blocked. A place is named row + column
--                       letter: 3B is row 3, column B.
--   cold_slot_bookings  the places a booking holds.
-- A place is taken for a period while a booking holding it is confirmed, paid
-- (waiting for the owner) or requested in the last 24 hours (held while the
-- farmer pays the owner). The map shows which places are taken, never by whom;
-- the owner sees who. Two farmers can never hold the same place for the same
-- months: booking and confirming check it inside one locked transaction.
-- Stores with a map count their free boxes from it (capacity and vacancy are
-- kept up to date automatically).
-- Run after 20261018000000_accounts_last_active.sql. Safe to run again.

-- ───────────────────────── chambers ─────────────────────────
create table if not exists public.cold_chambers (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.rental_listings (id) on delete cascade,
  name           text not null check (char_length(trim(name)) between 1 and 40),
  position       integer not null default 1 check (position between 1 and 100),
  rows           integer not null check (rows between 1 and 60),
  cols           integer not null check (cols between 1 and 26),
  boxes_per_slot integer not null check (boxes_per_slot between 1 and 5000),
  blocked        text[] not null default '{}' check (cardinality(blocked) <= 1560),
  note           text check (char_length(note) <= 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cold_chambers_listing on public.cold_chambers (listing_id, position);
alter table public.cold_chambers enable row level security;
drop trigger if exists cold_chambers_touch on public.cold_chambers;
create trigger cold_chambers_touch before update on public.cold_chambers for each row execute function public.kr_touch();

create table if not exists public.cold_slot_bookings (
  booking_id uuid not null references public.rental_bookings (id) on delete cascade,
  chamber_id uuid not null references public.cold_chambers (id) on delete cascade,
  slot       text not null check (slot ~ '^[1-9][0-9]?[A-Z]$'),
  primary key (booking_id, chamber_id, slot)
);
create index if not exists cold_slot_bookings_place on public.cold_slot_bookings (chamber_id, slot);
alter table public.cold_slot_bookings enable row level security;

-- ───────────────────────── helpers ─────────────────────────
-- The months a booking covers: from its start date, for `months` months.
create or replace function public.kr_cold_period(p_start date, p_months integer) returns daterange
language sql immutable as $$
  select daterange(p_start, (p_start + make_interval(months => greatest(p_months, 1)))::date, '[)')
$$;

-- Does this booking hold its places right now? (Requested bookings are held for 24 hours.)
create or replace function public.kr_cold_holds(p_status text, p_created timestamptz) returns boolean
language sql stable as $$
  select p_status in ('confirmed', 'paid') or (p_status = 'requested' and p_created > now() - interval '24 hours')
$$;

-- Is "3B" a usable place in this chamber?
create or replace function public.kr_cold_valid_slot(c public.cold_chambers, p_slot text) returns boolean
language sql immutable as $$
  select p_slot ~ '^[1-9][0-9]?[A-Z]$'
     and substring(p_slot from '^[0-9]+')::int between 1 and c.rows
     and ascii(right(p_slot, 1)) - 64 between 1 and c.cols
     and not (p_slot = any (c.blocked))
$$;

-- Capacity and vacancy of a store with a map, counted from its places
-- (null when the store has no map: then the owner keeps the box count by hand).
create or replace function public.kr_cold_counts(p_listing uuid, out capacity integer, out available integer)
language plpgsql stable security definer set search_path = public as $$
declare used integer;
begin
  select coalesce(sum((c.rows * c.cols - cardinality(c.blocked)) * c.boxes_per_slot), 0)::int into capacity
    from public.cold_chambers c where c.listing_id = p_listing;
  if capacity <= 0 then capacity := null; available := null; return; end if;
  select coalesce(sum(c.boxes_per_slot), 0)::int into used
    from public.cold_slot_bookings s
    join public.cold_chambers c on c.id = s.chamber_id
    join public.rental_bookings b on b.id = s.booking_id
   where c.listing_id = p_listing and b.status in ('confirmed', 'paid')
     and public.kr_cold_period(b.start_date, b.duration) @> current_date;
  available := greatest(0, capacity - used);
end $$;
revoke execute on function public.kr_cold_counts(uuid) from public, anon, authenticated;

-- Whenever a store with a map is saved, its capacity and vacancy come from the map.
create or replace function public.kr_cold_listing_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap integer; free integer;
begin
  select k.capacity, k.available into cap, free from public.kr_cold_counts(new.id) k;
  if cap is not null then
    new.capacity := cap;
    new.available := free;
  end if;
  return new;
end $$;
drop trigger if exists rental_listings_cold_counts on public.rental_listings;
create trigger rental_listings_cold_counts before update on public.rental_listings for each row execute function public.kr_cold_listing_counts();

create or replace function public.kr_cold_recount(p_listing uuid) returns void
language sql security definer set search_path = public as $$
  -- The trigger above fills in the numbers.
  update public.rental_listings set updated_at = now() where id = p_listing
$$;
revoke execute on function public.kr_cold_recount(uuid) from public, anon, authenticated;

-- Chambers: keep the blocked list tidy, never shrink or block under a booking,
-- and keep the store's capacity in step.
create or replace function public.kr_cold_chamber_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare taken text;
begin
  -- The same lock as booking, so the owner cannot block a place while a farmer books it.
  perform pg_advisory_xact_lock(hashtext('cold:' || (case when tg_op = 'DELETE' then old.listing_id else new.listing_id end)::text));
  if tg_op in ('INSERT', 'UPDATE') then
    if not exists (select 1 from public.rental_listings l where l.id = new.listing_id and l.kind = 'cold_store') then
      raise exception 'Chambers belong to a cold store';
    end if;
    new.name := trim(new.name);
    -- Only real places of this grid, once each.
    new.blocked := coalesce((
      select array_agg(distinct b order by b) from unnest(new.blocked) b
       where b ~ '^[1-9][0-9]?[A-Z]$' and substring(b from '^[0-9]+')::int <= new.rows and ascii(right(b, 1)) - 64 <= new.cols
    ), '{}');
  end if;
  -- Removing the whole store (its bookings go too) is allowed; only changing
  -- or deleting a chamber under a live booking is not.
  if tg_op = 'DELETE' and not exists (select 1 from public.rental_listings where id = old.listing_id) then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select s.slot into taken
      from public.cold_slot_bookings s join public.rental_bookings b on b.id = s.booking_id
     where s.chamber_id = old.id and public.kr_cold_holds(b.status, b.created_at)
       and (tg_op = 'DELETE' or not public.kr_cold_valid_slot(new, s.slot))
     limit 1;
    if taken is not null then
      raise exception 'Place % in % is booked by a farmer. Finish or cancel that booking first.', taken, old.name;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists cold_chambers_before on public.cold_chambers;
create trigger cold_chambers_before before insert or update or delete on public.cold_chambers for each row execute function public.kr_cold_chamber_before();

create or replace function public.kr_cold_chamber_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.kr_cold_recount(coalesce(new.listing_id, old.listing_id));
  return null;
end $$;
drop trigger if exists cold_chambers_after on public.cold_chambers;
create trigger cold_chambers_after after insert or update or delete on public.cold_chambers for each row execute function public.kr_cold_chamber_after();

-- ───────────────────────── who sees what ─────────────────────────
revoke all on public.cold_chambers, public.cold_slot_bookings from anon, authenticated;
grant select on public.cold_chambers to anon, authenticated;
grant insert, update, delete on public.cold_chambers to authenticated;
grant select on public.cold_slot_bookings to authenticated;

drop policy if exists cold_chambers_read on public.cold_chambers;
create policy cold_chambers_read on public.cold_chambers for select to anon, authenticated
  using (exists (select 1 from public.rental_listings l where l.id = listing_id and (l.active or l.owner_id = auth.uid())));
drop policy if exists cold_chambers_owner on public.cold_chambers;
create policy cold_chambers_owner on public.cold_chambers for all to authenticated
  using (exists (select 1 from public.rental_listings l where l.id = listing_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from public.rental_listings l where l.id = listing_id and l.owner_id = auth.uid()));

-- A booking's places: the farmer who booked and the store owner.
drop policy if exists cold_slot_bookings_read on public.cold_slot_bookings;
create policy cold_slot_bookings_read on public.cold_slot_bookings for select to authenticated
  using (exists (select 1 from public.rental_bookings b where b.id = booking_id and (b.renter_id = auth.uid() or b.owner_id = auth.uid())));

-- ───────────────────────── the map ─────────────────────────
-- Taken places of a store for the months asked: 'mine', 'booked' or 'held'
-- (requested or paid, waiting). Never says who.
-- (20261022000000_cold_shared_places.sql changes what it returns, so it is
-- dropped first when this file is run again.)
drop function if exists public.kr_cold_map(uuid, date, integer);
create or replace function public.kr_cold_map(p_listing uuid, p_start date, p_months integer)
returns table (chamber_id uuid, slot text, state text)
language sql stable security definer set search_path = public as $$
  select s.chamber_id, s.slot,
         case when b.renter_id = auth.uid() then 'mine' when b.status = 'confirmed' then 'booked' else 'held' end
    from public.cold_slot_bookings s
    join public.cold_chambers c on c.id = s.chamber_id
    join public.rental_bookings b on b.id = s.booking_id
    join public.rental_listings l on l.id = c.listing_id
   where c.listing_id = p_listing and (l.active or l.owner_id = auth.uid())
     and public.kr_cold_holds(b.status, b.created_at)
     and public.kr_cold_period(b.start_date, b.duration) && public.kr_cold_period(p_start, p_months)
$$;
grant execute on function public.kr_cold_map(uuid, date, integer) to anon, authenticated;

-- The first place of a booking that another live booking holds for overlapping months, if any.
create or replace function public.kr_cold_clash(p_booking uuid) returns text
language sql stable security definer set search_path = public as $$
  select c.name || ' · ' || s.slot
    from public.cold_slot_bookings s
    join public.rental_bookings me on me.id = s.booking_id
    join public.cold_slot_bookings o on o.chamber_id = s.chamber_id and o.slot = s.slot and o.booking_id <> s.booking_id
    join public.rental_bookings ob on ob.id = o.booking_id
    join public.cold_chambers c on c.id = s.chamber_id
   where s.booking_id = p_booking
     and public.kr_cold_holds(ob.status, ob.created_at)
     and public.kr_cold_period(ob.start_date, ob.duration) && public.kr_cold_period(me.start_date, me.duration)
   limit 1
$$;
revoke execute on function public.kr_cold_clash(uuid) from public, anon, authenticated;

-- ───────────────────────── booking places ─────────────────────────
-- p_slots: ['<chamber id>:3B', …]. Returns the new booking's id. The farmer
-- then pays the owner by UPI (the places are held for 24 hours) and the owner
-- confirms.
create or replace function public.kr_book_cold_slots(p_listing uuid, p_slots text[], p_start date, p_months integer, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.rental_listings;
  c public.cold_chambers;
  item text;
  chamber uuid;
  place text;
  boxes integer := 0;
  wanted jsonb := '[]'::jsonb;
  booking uuid;
  clash text;
begin
  if auth.uid() is null then raise exception 'Please sign in to book'; end if;
  if not public.kr_kyc_ok() then raise exception 'Verify your Aadhaar first (My details → Identity check), then book.'; end if;
  select * into l from public.rental_listings where id = p_listing;
  if not found or not l.active or l.kind <> 'cold_store' then raise exception 'This cold store is not taking bookings'; end if;
  if l.owner_id = auth.uid() then raise exception 'You cannot book your own cold store'; end if;
  if p_months is null or p_months not between 1 and 24 then raise exception 'Choose from 1 to 24 months'; end if;
  if p_start is null or p_start < current_date - 1 or p_start > current_date + 400 then raise exception 'Choose a start date from today'; end if;
  if coalesce(cardinality(p_slots), 0) = 0 then raise exception 'Choose at least one place on the map'; end if;
  if cardinality(p_slots) > 300 then raise exception 'Choose at most 300 places in one booking'; end if;

  -- One booking at a time per store, so two farmers can never take the same place.
  perform pg_advisory_xact_lock(hashtext('cold:' || p_listing::text));

  foreach item in array (select array_agg(distinct x) from unnest(p_slots) x) loop
    chamber := nullif(split_part(item, ':', 1), '')::uuid;
    place := upper(split_part(item, ':', 2));
    select * into c from public.cold_chambers where id = chamber and listing_id = p_listing;
    if not found then raise exception 'That chamber is not part of this cold store'; end if;
    if not public.kr_cold_valid_slot(c, place) then raise exception 'Place % in % cannot be booked', place, c.name; end if;
    if exists (
      select 1 from public.cold_slot_bookings s join public.rental_bookings b on b.id = s.booking_id
       where s.chamber_id = c.id and s.slot = place and public.kr_cold_holds(b.status, b.created_at)
         and public.kr_cold_period(b.start_date, b.duration) && public.kr_cold_period(p_start, p_months)
    ) then
      raise exception 'Place % in % was just taken by someone else. Please choose another.', place, c.name;
    end if;
    boxes := boxes + c.boxes_per_slot;
    wanted := wanted || jsonb_build_object('chamber', c.id, 'slot', place);
  end loop;

  perform set_config('kr.cold_slots', 'on', true);
  insert into public.rental_bookings (listing_id, renter_id, renter_name, renter_phone, units, duration, start_date, status)
  values (p_listing, auth.uid(), left(trim(p_name), 80), left(regexp_replace(p_phone, '\s', '', 'g'), 20), boxes, p_months, p_start, 'requested')
  returning id into booking;
  perform set_config('kr.cold_slots', 'off', true);

  insert into public.cold_slot_bookings (booking_id, chamber_id, slot)
  select booking, (w ->> 'chamber')::uuid, w ->> 'slot' from jsonb_array_elements(wanted) w;

  clash := public.kr_cold_clash(booking);
  if clash is not null then raise exception 'Place % was just taken by someone else. Please choose another.', clash; end if;
  return booking;
end $$;
revoke execute on function public.kr_book_cold_slots(uuid, text[], date, integer, text, text) from public, anon;
grant execute on function public.kr_book_cold_slots(uuid, text[], date, integer, text, text) to authenticated;

-- Price and owner always come from the listing, never from the browser.
-- Stores with a map are booked by place (kr_book_cold_slots), not by a box count.
create or replace function public.kr_before_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.rental_listings; by_place boolean := coalesce(current_setting('kr.cold_slots', true), '') = 'on';
begin
  select * into l from public.rental_listings where id = new.listing_id;
  if not found or not l.active then raise exception 'This listing is not available'; end if;
  if l.owner_id = new.renter_id then raise exception 'You cannot book your own listing'; end if;
  if not by_place then
    if exists (select 1 from public.cold_chambers c where c.listing_id = l.id) then
      raise exception 'Choose your places on the cold store map to book this store';
    end if;
    if new.units < l.min_units then raise exception 'Minimum booking is % %', l.min_units, case when l.unit = 'box_month' then 'boxes' else 'units' end; end if;
    if new.units > l.available then raise exception 'Only % available right now', l.available; end if;
  end if;
  if new.status not in ('requested', 'paid') then raise exception 'New bookings start as requested or paid'; end if;
  if new.status = 'paid' and new.payment_ref is null then raise exception 'Enter the UPI / bank reference number of your payment'; end if;
  new.owner_id := l.owner_id;
  new.amount := round(l.rate * new.units * new.duration, 2);
  new.owner_note := null;
  return new;
end $$;

-- renter: pay, cancel · owner: confirm (holds the space), reject, complete (frees it).
-- Bookings by place: paying after the 24-hour hold, and confirming, check that
-- nobody else holds the places for those months; the store's vacancy is
-- counted from the map instead of by hand.
create or replace function public.kr_booking_action(p_booking uuid, p_action text, p_ref text default null, p_note text default null)
returns public.rental_bookings language plpgsql security definer set search_path = public as $$
declare b public.rental_bookings; l public.rental_listings; by_place boolean; clash text;
begin
  select * into b from public.rental_bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  select * into l from public.rental_listings where id = b.listing_id for update;
  by_place := exists (select 1 from public.cold_slot_bookings where booking_id = b.id);
  if by_place then perform pg_advisory_xact_lock(hashtext('cold:' || l.id::text)); end if;
  if p_action = 'pay' then
    if b.renter_id <> auth.uid() then raise exception 'Not your booking'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking can no longer be paid'; end if;
    if p_ref is null or p_ref !~ '^[A-Za-z0-9]{6,30}$' then raise exception 'Enter the 12-digit UPI reference (UTR) from your payment app'; end if;
    if by_place and b.status = 'requested' and b.created_at <= now() - interval '24 hours' then
      clash := public.kr_cold_clash(b.id);
      if clash is not null then
        raise exception 'Your 24-hour hold ended and % has been booked by someone else. Cancel this booking and choose another place. (If you already paid, ask the owner for the money back.)', clash;
      end if;
    end if;
    update public.rental_bookings set status = 'paid', payment_ref = p_ref where id = p_booking returning * into b;
  elsif p_action = 'cancel' then
    if b.renter_id <> auth.uid() then raise exception 'Not your booking'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'Only bookings not yet confirmed can be cancelled'; end if;
    update public.rental_bookings set status = 'cancelled' where id = p_booking returning * into b;
  elsif p_action = 'confirm' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can confirm'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking is already %', b.status; end if;
    if by_place then
      -- Another farmer's paid or confirmed booking on the same place and months.
      select c.name || ' · ' || s.slot into clash
        from public.cold_slot_bookings s
        join public.cold_slot_bookings o on o.chamber_id = s.chamber_id and o.slot = s.slot and o.booking_id <> s.booking_id
        join public.rental_bookings ob on ob.id = o.booking_id
        join public.cold_chambers c on c.id = s.chamber_id
       where s.booking_id = b.id and ob.status in ('confirmed', 'paid')
         and public.kr_cold_period(ob.start_date, ob.duration) && public.kr_cold_period(b.start_date, b.duration)
       limit 1;
      if clash is not null then raise exception '% is already booked for those months. Decline this booking.', clash; end if;
    else
      if l.available < b.units then raise exception 'Not enough space left: % available', l.available; end if;
      update public.rental_listings set available = available - b.units where id = l.id;
    end if;
    update public.rental_bookings set status = 'confirmed', owner_note = left(p_note, 300) where id = p_booking returning * into b;
  elsif p_action = 'reject' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can reject'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking is already %', b.status; end if;
    update public.rental_bookings set status = 'rejected', owner_note = left(p_note, 300) where id = p_booking returning * into b;
  elsif p_action = 'complete' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can close a booking'; end if;
    if b.status <> 'confirmed' then raise exception 'Only confirmed bookings can be completed'; end if;
    if not by_place then update public.rental_listings set available = least(capacity, available + b.units) where id = l.id; end if;
    update public.rental_bookings set status = 'completed' where id = p_booking returning * into b;
  else
    raise exception 'Unknown action';
  end if;
  if by_place then perform public.kr_cold_recount(l.id); end if;
  return b;
end $$;

-- ════════ 20261021000000_cold_chamber_size.sql ════════
-- KashRoot: cold store chambers drawn from their real size.
--   cold_chambers.size  what the owner measured — length (door to back wall),
--                       breadth and height in metres, the unit they use, and
--                       their store's standards (box size, stack base,
--                       walkway, air gaps). The app works out the rows, stacks
--                       and boxes per place from it; rows / cols /
--                       boxes_per_slot keep what booking uses.
-- Run after 20261020000000_cold_store_map.sql. Safe to run again.

alter table public.cold_chambers add column if not exists size jsonb;
alter table public.cold_chambers drop constraint if exists cold_chambers_size_check;
alter table public.cold_chambers add constraint cold_chambers_size_check
  check (size is null or (jsonb_typeof(size) = 'object' and pg_column_size(size) < 4000));

-- ════════ 20261022000000_cold_shared_places.sql ════════
-- KashRoot: shared places in the cold store — every farmer books just the
-- boxes they have, 20 or 2,000, and pays for those boxes only.
--   A place (one stack) holds the boxes the owner set. Several farmers can
--   share a place until it is full; each farmer's boxes on it are counted.
--   cold_slot_bookings.boxes   how many of the booking's boxes stand on that place
-- Bookings made before this took the whole place (filled in below).
-- The map shows, for each place, how many boxes are already booked on it
-- (never by whom); booking and confirming check that a place never holds
-- more than it can, inside the same lock as before.
-- Run after 20261021000000_cold_chamber_size.sql. Safe to run again.

alter table public.cold_slot_bookings add column if not exists boxes integer;
alter table public.cold_slot_bookings drop constraint if exists cold_slot_bookings_boxes_check;
alter table public.cold_slot_bookings add constraint cold_slot_bookings_boxes_check check (boxes is null or boxes between 1 and 5000);
update public.cold_slot_bookings s set boxes = c.boxes_per_slot
  from public.cold_chambers c where c.id = s.chamber_id and s.boxes is null;

-- Boxes on a place held by live bookings for months overlapping p_period
-- (p_firm: only paid and confirmed bookings), leaving out one booking.
create or replace function public.kr_cold_used(p_chamber uuid, p_slot text, p_period daterange, p_except uuid default null, p_firm boolean default false)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(coalesce(s.boxes, c.boxes_per_slot)), 0)::int
    from public.cold_slot_bookings s
    join public.cold_chambers c on c.id = s.chamber_id
    join public.rental_bookings b on b.id = s.booking_id
   where s.chamber_id = p_chamber and s.slot = p_slot
     and (p_except is null or s.booking_id <> p_except)
     and case when p_firm then b.status in ('confirmed', 'paid') else public.kr_cold_holds(b.status, b.created_at) end
     and public.kr_cold_period(b.start_date, b.duration) && p_period
$$;
revoke execute on function public.kr_cold_used(uuid, text, daterange, uuid, boolean) from public, anon, authenticated;

-- The first place of a booking that would hold more boxes than it can,
-- counting the other live bookings for overlapping months.
create or replace function public.kr_cold_over(p_booking uuid, p_firm boolean default false) returns text
language sql stable security definer set search_path = public as $$
  select c.name || ' · ' || s.slot
    from public.cold_slot_bookings s
    join public.rental_bookings me on me.id = s.booking_id
    join public.cold_chambers c on c.id = s.chamber_id
   where s.booking_id = p_booking
     and coalesce(s.boxes, c.boxes_per_slot)
       + public.kr_cold_used(s.chamber_id, s.slot, public.kr_cold_period(me.start_date, me.duration), p_booking, p_firm) > c.boxes_per_slot
   limit 1
$$;
revoke execute on function public.kr_cold_over(uuid, boolean) from public, anon, authenticated;

-- Kept for kr_booking_action (paying after the 24-hour hold): now "is a place over full".
create or replace function public.kr_cold_clash(p_booking uuid) returns text
language sql stable security definer set search_path = public as $$
  select public.kr_cold_over(p_booking, false)
$$;
revoke execute on function public.kr_cold_clash(uuid) from public, anon, authenticated;

-- Capacity and vacancy of a store with a map: booked boxes, place by place.
create or replace function public.kr_cold_counts(p_listing uuid, out capacity integer, out available integer)
language plpgsql stable security definer set search_path = public as $$
declare used integer;
begin
  select coalesce(sum((c.rows * c.cols - cardinality(c.blocked)) * c.boxes_per_slot), 0)::int into capacity
    from public.cold_chambers c where c.listing_id = p_listing;
  if capacity <= 0 then capacity := null; available := null; return; end if;
  select coalesce(sum(coalesce(s.boxes, c.boxes_per_slot)), 0)::int into used
    from public.cold_slot_bookings s
    join public.cold_chambers c on c.id = s.chamber_id
    join public.rental_bookings b on b.id = s.booking_id
   where c.listing_id = p_listing and b.status in ('confirmed', 'paid')
     and public.kr_cold_period(b.start_date, b.duration) @> current_date;
  available := greatest(0, capacity - used);
end $$;
revoke execute on function public.kr_cold_counts(uuid) from public, anon, authenticated;

-- Chambers: as before, and a place cannot be made smaller than the boxes
-- farmers have booked on it.
create or replace function public.kr_cold_chamber_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare taken text; booked integer;
begin
  -- The same lock as booking, so the owner cannot block a place while a farmer books it.
  perform pg_advisory_xact_lock(hashtext('cold:' || (case when tg_op = 'DELETE' then old.listing_id else new.listing_id end)::text));
  if tg_op in ('INSERT', 'UPDATE') then
    if not exists (select 1 from public.rental_listings l where l.id = new.listing_id and l.kind = 'cold_store') then
      raise exception 'Chambers belong to a cold store';
    end if;
    new.name := trim(new.name);
    -- Only real places of this grid, once each.
    new.blocked := coalesce((
      select array_agg(distinct b order by b) from unnest(new.blocked) b
       where b ~ '^[1-9][0-9]?[A-Z]$' and substring(b from '^[0-9]+')::int <= new.rows and ascii(right(b, 1)) - 64 <= new.cols
    ), '{}');
  end if;
  -- Removing the whole store (its bookings go too) is allowed; only changing
  -- or deleting a chamber under a live booking is not.
  if tg_op = 'DELETE' and not exists (select 1 from public.rental_listings where id = old.listing_id) then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select s.slot into taken
      from public.cold_slot_bookings s join public.rental_bookings b on b.id = s.booking_id
     where s.chamber_id = old.id and public.kr_cold_holds(b.status, b.created_at)
       and (tg_op = 'DELETE' or not public.kr_cold_valid_slot(new, s.slot))
     limit 1;
    if taken is not null then
      raise exception 'Place % in % is booked by a farmer. Finish or cancel that booking first.', taken, old.name;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.boxes_per_slot < old.boxes_per_slot then
    -- The most boxes booked on one place at one time.
    select s.slot, coalesce(s.boxes, old.boxes_per_slot)
             + public.kr_cold_used(old.id, s.slot, public.kr_cold_period(b.start_date, b.duration), s.booking_id)
      into taken, booked
      from public.cold_slot_bookings s join public.rental_bookings b on b.id = s.booking_id
     where s.chamber_id = old.id and public.kr_cold_holds(b.status, b.created_at)
     order by 2 desc
     limit 1;
    if booked > new.boxes_per_slot then
      raise exception 'Place % in % is booked by a farmer with % boxes. Keep at least % boxes on each place, or finish that booking first.', taken, old.name, booked, booked;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ───────────────────────── the map ─────────────────────────
-- For each place with boxes booked for the months asked: its state, the
-- boxes others have booked on it, and the boxes the caller has on it.
--   mine     the caller has boxes here
--   booked   full, all confirmed        held   full, some waiting for payment
--   part     some boxes booked, room left for more
-- Never says who.
drop function if exists public.kr_cold_map(uuid, date, integer);
create function public.kr_cold_map(p_listing uuid, p_start date, p_months integer)
returns table (chamber_id uuid, slot text, state text, used integer, mine integer)
language sql stable security definer set search_path = public as $$
  with live as (
    select s.chamber_id, s.slot, c.boxes_per_slot as cap,
           coalesce(s.boxes, c.boxes_per_slot) as n,
           coalesce(b.renter_id = auth.uid(), false) as is_mine,
           b.status = 'confirmed' as firm
      from public.cold_slot_bookings s
      join public.cold_chambers c on c.id = s.chamber_id
      join public.rental_bookings b on b.id = s.booking_id
      join public.rental_listings l on l.id = c.listing_id
     where c.listing_id = p_listing and (l.active or l.owner_id = auth.uid())
       and public.kr_cold_holds(b.status, b.created_at)
       and public.kr_cold_period(b.start_date, b.duration) && public.kr_cold_period(p_start, p_months)
  )
  select live.chamber_id, live.slot,
         case when bool_or(is_mine) then 'mine'
              when sum(n) >= max(cap) then case when bool_and(firm) then 'booked' else 'held' end
              else 'part' end,
         (coalesce(sum(n) filter (where not is_mine), 0))::int,
         (coalesce(sum(n) filter (where is_mine), 0))::int
    from live
   group by live.chamber_id, live.slot
$$;
grant execute on function public.kr_cold_map(uuid, date, integer) to anon, authenticated;

-- ───────────────────────── booking ─────────────────────────
-- p_places: ['<chamber id>:3B:50', …] — a place and how many of the farmer's
-- boxes go on it (no count: the whole place). Returns the new booking's id.
-- The farmer pays for their own boxes only, then pays the owner by UPI (the
-- boxes are held for 24 hours) and the owner confirms.
create or replace function public.kr_book_cold_places(p_listing uuid, p_places text[], p_start date, p_months integer, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.rental_listings;
  c public.cold_chambers;
  item text;
  chamber uuid;
  place text;
  count_text text;
  n integer;
  room integer;
  boxes integer := 0;
  seen text[] := '{}';
  wanted jsonb := '[]'::jsonb;
  booking uuid;
  clash text;
begin
  if auth.uid() is null then raise exception 'Please sign in to book'; end if;
  if not public.kr_kyc_ok() then raise exception 'Verify your Aadhaar first (My details → Identity check), then book.'; end if;
  select * into l from public.rental_listings where id = p_listing;
  if not found or not l.active or l.kind <> 'cold_store' then raise exception 'This cold store is not taking bookings'; end if;
  if l.owner_id = auth.uid() then raise exception 'You cannot book your own cold store'; end if;
  if p_months is null or p_months not between 1 and 24 then raise exception 'Choose from 1 to 24 months'; end if;
  if p_start is null or p_start < current_date - 1 or p_start > current_date + 400 then raise exception 'Choose a start date from today'; end if;
  if coalesce(cardinality(p_places), 0) = 0 then raise exception 'Choose at least one place on the map'; end if;
  if cardinality(p_places) > 300 then raise exception 'Choose at most 300 places in one booking'; end if;

  -- One booking at a time per store, so a place can never be filled twice over.
  perform pg_advisory_xact_lock(hashtext('cold:' || p_listing::text));

  foreach item in array p_places loop
    chamber := nullif(split_part(item, ':', 1), '')::uuid;
    place := upper(split_part(item, ':', 2));
    count_text := split_part(item, ':', 3);
    select * into c from public.cold_chambers where id = chamber and listing_id = p_listing;
    if not found then raise exception 'That chamber is not part of this cold store'; end if;
    if not public.kr_cold_valid_slot(c, place) then raise exception 'Place % in % cannot be booked', place, c.name; end if;
    if (c.id::text || ':' || place) = any (seen) then raise exception 'Choose place % in % once', place, c.name; end if;
    seen := seen || (c.id::text || ':' || place);
    if count_text !~ '^[0-9]{0,4}$' then raise exception 'Choose how many boxes go on place % in %', place, c.name; end if;
    n := coalesce(nullif(count_text, '')::int, c.boxes_per_slot);
    if n < 1 or n > c.boxes_per_slot then
      raise exception 'Place % in % holds % boxes. Choose from 1 to % boxes for it.', place, c.name, c.boxes_per_slot, c.boxes_per_slot;
    end if;
    room := c.boxes_per_slot - public.kr_cold_used(c.id, place, public.kr_cold_period(p_start, p_months));
    if room <= 0 then
      raise exception 'Place % in % was just taken by someone else. Please choose another.', place, c.name;
    elsif n > room then
      raise exception 'Place % in % was just partly taken by someone else: room is left for % boxes. Please choose again.', place, c.name, room;
    end if;
    boxes := boxes + n;
    wanted := wanted || jsonb_build_object('chamber', c.id, 'slot', place, 'boxes', n);
  end loop;
  if boxes < l.min_units then
    raise exception 'This cold store takes at least % boxes in one booking', l.min_units;
  end if;

  perform set_config('kr.cold_slots', 'on', true);
  insert into public.rental_bookings (listing_id, renter_id, renter_name, renter_phone, units, duration, start_date, status)
  values (p_listing, auth.uid(), left(trim(p_name), 80), left(regexp_replace(p_phone, '\s', '', 'g'), 20), boxes, p_months, p_start, 'requested')
  returning id into booking;
  perform set_config('kr.cold_slots', 'off', true);

  insert into public.cold_slot_bookings (booking_id, chamber_id, slot, boxes)
  select booking, (w ->> 'chamber')::uuid, w ->> 'slot', (w ->> 'boxes')::int from jsonb_array_elements(wanted) w;

  clash := public.kr_cold_over(booking, false);
  if clash is not null then raise exception 'Place % was just taken by someone else. Please choose another.', clash; end if;
  return booking;
end $$;
revoke execute on function public.kr_book_cold_places(uuid, text[], date, integer, text, text) from public, anon;
grant execute on function public.kr_book_cold_places(uuid, text[], date, integer, text, text) to authenticated;

-- The older call books whole places: the same thing without counts (a place
-- named twice counts once, as before).
create or replace function public.kr_book_cold_slots(p_listing uuid, p_slots text[], p_start date, p_months integer, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from unnest(p_slots) x where split_part(x, ':', 3) <> '') then
    raise exception 'Choose how many boxes go on each place';
  end if;
  return public.kr_book_cold_places(
    p_listing,
    (select array_agg(distinct lower(split_part(x, ':', 1)) || ':' || upper(split_part(x, ':', 2))) from unnest(p_slots) x),
    p_start, p_months, p_name, p_phone);
end $$;
revoke execute on function public.kr_book_cold_slots(uuid, text[], date, integer, text, text) from public, anon;
grant execute on function public.kr_book_cold_slots(uuid, text[], date, integer, text, text) to authenticated;

-- renter: pay, cancel · owner: confirm (holds the space), reject, complete (frees it).
-- Bookings by place: paying after the 24-hour hold, and confirming, check that
-- no place would hold more boxes than it can for those months; the store's
-- vacancy is counted from the map instead of by hand.
create or replace function public.kr_booking_action(p_booking uuid, p_action text, p_ref text default null, p_note text default null)
returns public.rental_bookings language plpgsql security definer set search_path = public as $$
declare b public.rental_bookings; l public.rental_listings; by_place boolean; clash text;
begin
  select * into b from public.rental_bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  select * into l from public.rental_listings where id = b.listing_id for update;
  by_place := exists (select 1 from public.cold_slot_bookings where booking_id = b.id);
  if by_place then perform pg_advisory_xact_lock(hashtext('cold:' || l.id::text)); end if;
  if p_action = 'pay' then
    if b.renter_id <> auth.uid() then raise exception 'Not your booking'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking can no longer be paid'; end if;
    if p_ref is null or p_ref !~ '^[A-Za-z0-9]{6,30}$' then raise exception 'Enter the 12-digit UPI reference (UTR) from your payment app'; end if;
    if by_place and b.status = 'requested' and b.created_at <= now() - interval '24 hours' then
      clash := public.kr_cold_clash(b.id);
      if clash is not null then
        raise exception 'Your 24-hour hold ended and % has been booked by someone else. Cancel this booking and choose another place. (If you already paid, ask the owner for the money back.)', clash;
      end if;
    end if;
    update public.rental_bookings set status = 'paid', payment_ref = p_ref where id = p_booking returning * into b;
  elsif p_action = 'cancel' then
    if b.renter_id <> auth.uid() then raise exception 'Not your booking'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'Only bookings not yet confirmed can be cancelled'; end if;
    update public.rental_bookings set status = 'cancelled' where id = p_booking returning * into b;
  elsif p_action = 'confirm' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can confirm'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking is already %', b.status; end if;
    if by_place then
      -- Other farmers' paid or confirmed boxes on the same places and months.
      clash := public.kr_cold_over(b.id, true);
      if clash is not null then raise exception '% is already booked for those months. Decline this booking.', clash; end if;
    else
      if l.available < b.units then raise exception 'Not enough space left: % available', l.available; end if;
      update public.rental_listings set available = available - b.units where id = l.id;
    end if;
    update public.rental_bookings set status = 'confirmed', owner_note = left(p_note, 300) where id = p_booking returning * into b;
  elsif p_action = 'reject' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can reject'; end if;
    if b.status not in ('requested', 'paid') then raise exception 'This booking is already %', b.status; end if;
    update public.rental_bookings set status = 'rejected', owner_note = left(p_note, 300) where id = p_booking returning * into b;
  elsif p_action = 'complete' then
    if b.owner_id <> auth.uid() then raise exception 'Only the owner can close a booking'; end if;
    if b.status <> 'confirmed' then raise exception 'Only confirmed bookings can be completed'; end if;
    if not by_place then update public.rental_listings set available = least(capacity, available + b.units) where id = l.id; end if;
    update public.rental_bookings set status = 'completed' where id = p_booking returning * into b;
  else
    raise exception 'Unknown action';
  end if;
  if by_place then perform public.kr_cold_recount(l.id); end if;
  return b;
end $$;

-- Every store with a map: count again with the boxes on each place.
do $$ begin
  perform public.kr_cold_recount(l.id) from public.rental_listings l
   where exists (select 1 from public.cold_chambers c where c.listing_id = l.id);
end $$;

-- ════════ 20261023000000_cold_store_directory.sql ════════
-- KashRoot: the directory of ALL cold stores — not only those on KashRoot.
--   cold_store_directory  real cold stores and CA stores in Jammu & Kashmir,
--                         each saying where it comes from (e.g. the National
--                         Horticulture Board's cold storage database, a MoFPI
--                         list, the owner). Everyone can read it; only an
--                         admin adds, imports or removes entries.
-- The KashRoot server also reads the official NHB list and OpenStreetMap
-- live (api/cold-stores); this table keeps what the admin has imported or
-- checked, so the directory never depends on one website being up.
-- Stores listed on KashRoot (rental_listings) are shown with it, bookable.
-- Run after 20261022000000_cold_shared_places.sql. Safe to run again.

create table if not exists public.cold_store_directory (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 2 and 120),
  district    text check (char_length(district) <= 60),
  place       text check (char_length(place) <= 160),
  state       text not null default 'Jammu & Kashmir' check (char_length(state) between 2 and 60),
  capacity_mt integer check (capacity_mt is null or capacity_mt between 1 and 1000000),
  kind        text check (kind is null or kind in ('ca', 'cold', 'multi')),
  phone       text check (phone is null or char_length(phone) between 6 and 20),
  lat         double precision check (lat is null or lat between -90 and 90),
  lon         double precision check (lon is null or lon between -180 and 180),
  source      text not null check (char_length(trim(source)) between 2 and 200),
  source_url  text check (source_url is null or (source_url ~ '^https?://' and char_length(source_url) <= 500)),
  added_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- One entry per store: the same name in the same district is the same store.
create unique index if not exists cold_store_directory_store on public.cold_store_directory (lower(trim(name)), lower(coalesce(trim(district), '')));
create index if not exists cold_store_directory_district on public.cold_store_directory (district);
alter table public.cold_store_directory enable row level security;
drop trigger if exists cold_store_directory_touch on public.cold_store_directory;
create trigger cold_store_directory_touch before update on public.cold_store_directory for each row execute function public.kr_touch();

revoke all on public.cold_store_directory from anon, authenticated;
grant select on public.cold_store_directory to anon, authenticated;
grant insert, update, delete on public.cold_store_directory to authenticated;

drop policy if exists cold_store_directory_read on public.cold_store_directory;
create policy cold_store_directory_read on public.cold_store_directory for select to anon, authenticated using (true);
drop policy if exists cold_store_directory_admin on public.cold_store_directory;
create policy cold_store_directory_admin on public.cold_store_directory for all to authenticated
  using (public.kr_has_role('ADMIN')) with check (public.kr_has_role('ADMIN'));

-- Admin: import many entries at once (e.g. the NHB file). Stores already in
-- the directory (same name and district) are left as they are. Returns how
-- many were added.
create or replace function public.kr_directory_import(p_rows jsonb, p_source text, p_source_url text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare added integer;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can import cold stores'; end if;
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
revoke execute on function public.kr_directory_import(jsonb, text, text) from public, anon;
grant execute on function public.kr_directory_import(jsonb, text, text) to authenticated;

-- ════════ 20261024000000_cold_store_suggestions.sql ════════
-- KashRoot: farmers, owners and helpers can suggest a cold store that is
-- missing from the directory (e.g. a CA store in Lassipora the official list
-- does not have). A suggestion waits ("pending") until the KashRoot admin
-- checks it; only then does everyone see it. The person who suggested it
-- sees their own suggestion while it waits.
-- Run after 20261023000000_cold_store_directory.sql. Safe to run again.

alter table public.cold_store_directory add column if not exists status text not null default 'approved';
alter table public.cold_store_directory drop constraint if exists cold_store_directory_status_check;
alter table public.cold_store_directory add constraint cold_store_directory_status_check check (status in ('approved', 'pending'));
create index if not exists cold_store_directory_pending on public.cold_store_directory (created_at) where status = 'pending';

-- Everyone reads checked entries; the admin and the person who suggested an entry also see it while it waits.
drop policy if exists cold_store_directory_read on public.cold_store_directory;
create policy cold_store_directory_read on public.cold_store_directory for select to anon, authenticated
  using (status = 'approved' or added_by = auth.uid() or public.kr_has_role('ADMIN'));

-- Anyone signed in may suggest one (it waits for the admin).
drop policy if exists cold_store_directory_suggest on public.cold_store_directory;
create policy cold_store_directory_suggest on public.cold_store_directory for insert to authenticated
  with check (status = 'pending' and added_by = auth.uid());

-- Suggestions: a plain source line, and at most 20 a day per person.
create or replace function public.kr_cold_suggestion_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and not public.kr_has_role('ADMIN') then
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
drop trigger if exists cold_store_directory_suggestion on public.cold_store_directory;
create trigger cold_store_directory_suggestion before insert on public.cold_store_directory for each row execute function public.kr_cold_suggestion_before();

-- ════════ 20261025000000_cold_store_details.sql ════════
-- KashRoot: cold stores described in full by their owners (the owner wizard,
-- components/rental/owner and lib/coldStore).
--   rental_listings  + manager_name, manager_phone (10 digits), state (default
--                      Jammu & Kashmir), area (area / village), building:
--                      {unit: 'ft' | 'm', length, width, height,
--                       door: {wall: 'front' | 'back' | 'left' | 'right',
--                              from, width, height}}
--                      in metres; length runs along the front, width from the
--                      front to the back; the door's `from` is from the left
--                      corner of its wall as you stand outside facing it.
--   cold_chambers    + chamber_no, floor (1 = lowest), storage ('bins',
--                      'crates', or 'boxes' for stores set up before),
--                      unit_kg (kg in one bin / crate), capacity_mt (what the
--                      owner says the whole chamber holds), rate (rupees per
--                      bin / crate per month; null = the store's rate).
--                      Each floor of a chamber is its own row ("Chamber 1 ·
--                      Floor 2"), so booking, holds and the map work as
--                      before: one place = one stack, boxes_per_slot = bins /
--                      crates in it. A floor may now have up to 99 rows.
--   kr_save_cold_chambers(listing, rows)  the owner saves all the wizard's
--                      chambers of a store at once: new floors added, changed
--                      ones changed in place, removed ones deleted — refused
--                      (nothing saved) when a farmer has booked a place that
--                      would go or shrink. Older chambers are left alone.
--   A booking by place costs each chamber's own rate (else the store's):
--   boxes × rate × months, worked out here, never in the browser.
-- Run after 20261024000000_cold_store_suggestions.sql. Safe to run again.

-- ───────────────────────── the store ─────────────────────────
alter table public.rental_listings add column if not exists manager_name text;
alter table public.rental_listings add column if not exists manager_phone text;
alter table public.rental_listings add column if not exists state text not null default 'Jammu & Kashmir';
alter table public.rental_listings add column if not exists area text;
alter table public.rental_listings add column if not exists building jsonb;

alter table public.rental_listings drop constraint if exists rental_listings_manager_name_check;
alter table public.rental_listings add constraint rental_listings_manager_name_check check (manager_name is null or char_length(manager_name) <= 80);
alter table public.rental_listings drop constraint if exists rental_listings_manager_phone_check;
alter table public.rental_listings add constraint rental_listings_manager_phone_check check (manager_phone is null or manager_phone ~ '^[6-9][0-9]{9}$');
alter table public.rental_listings drop constraint if exists rental_listings_state_check;
alter table public.rental_listings add constraint rental_listings_state_check check (char_length(state) between 2 and 60);
alter table public.rental_listings drop constraint if exists rental_listings_area_check;
alter table public.rental_listings add constraint rental_listings_area_check check (area is null or char_length(area) <= 80);
alter table public.rental_listings drop constraint if exists rental_listings_building_check;
alter table public.rental_listings add constraint rental_listings_building_check
  check (building is null or (jsonb_typeof(building) = 'object' and pg_column_size(building) < 2000));

-- ───────────────────────── chambers and their floors ─────────────────────────
alter table public.cold_chambers add column if not exists chamber_no integer;
alter table public.cold_chambers add column if not exists floor integer not null default 1;
alter table public.cold_chambers add column if not exists storage text not null default 'boxes';
alter table public.cold_chambers add column if not exists unit_kg numeric(10, 2);
alter table public.cold_chambers add column if not exists capacity_mt numeric(12, 3);
alter table public.cold_chambers add column if not exists rate numeric(12, 2);

alter table public.cold_chambers drop constraint if exists cold_chambers_chamber_no_check;
alter table public.cold_chambers add constraint cold_chambers_chamber_no_check check (chamber_no is null or chamber_no between 1 and 999);
alter table public.cold_chambers drop constraint if exists cold_chambers_floor_check;
alter table public.cold_chambers add constraint cold_chambers_floor_check check (floor between 1 and 10);
alter table public.cold_chambers drop constraint if exists cold_chambers_storage_check;
alter table public.cold_chambers add constraint cold_chambers_storage_check check (storage in ('bins', 'crates', 'boxes'));
alter table public.cold_chambers drop constraint if exists cold_chambers_unit_kg_check;
alter table public.cold_chambers add constraint cold_chambers_unit_kg_check check (unit_kg is null or (unit_kg > 0 and unit_kg <= 5000));
alter table public.cold_chambers drop constraint if exists cold_chambers_capacity_mt_check;
alter table public.cold_chambers add constraint cold_chambers_capacity_mt_check check (capacity_mt is null or (capacity_mt > 0 and capacity_mt <= 1000000));
alter table public.cold_chambers drop constraint if exists cold_chambers_rate_check;
alter table public.cold_chambers add constraint cold_chambers_rate_check check (rate is null or (rate >= 0 and rate <= 100000));
-- A floor of a big chamber may need more rows than the old map's 60 (place codes allow 1–99).
alter table public.cold_chambers drop constraint if exists cold_chambers_rows_check;
alter table public.cold_chambers add constraint cold_chambers_rows_check check (rows between 1 and 99);
alter table public.cold_chambers drop constraint if exists cold_chambers_blocked_check;
alter table public.cold_chambers add constraint cold_chambers_blocked_check check (cardinality(blocked) <= 2574);
-- One row per floor of each numbered chamber.
create unique index if not exists cold_chambers_floor on public.cold_chambers (listing_id, chamber_no, floor) where chamber_no is not null;

-- ───────────────────────── saving a store's chambers ─────────────────────────
-- p_rows: [{chamber_no, floor, name, position, rows, cols, boxes_per_slot,
-- blocked, storage, unit_kg, capacity_mt, rate, size}, …] — every floor of
-- every wizard chamber the store should have (lib/coldStore storeModel).
create or replace function public.kr_save_cold_chambers(p_listing uuid, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  l public.rental_listings;
  r jsonb;
  keep text[] := '{}';
  found_id uuid;
  n integer := 0;
  lowest numeric;
begin
  if auth.uid() is null then raise exception 'Please sign in again to save your cold store'; end if;
  select * into l from public.rental_listings where id = p_listing;
  if not found or l.owner_id is distinct from auth.uid() then raise exception 'This is not your cold store'; end if;
  if l.kind <> 'cold_store' then raise exception 'Chambers belong to a cold store'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Nothing to save'; end if;
  if jsonb_array_length(p_rows) > 100 then
    raise exception 'A cold store on KashRoot can have at most 100 chamber floors (chambers × floors). Use fewer chambers or floors.';
  end if;

  -- The same lock as booking, so nobody books a place while it changes.
  perform pg_advisory_xact_lock(hashtext('cold:' || p_listing::text));

  for r in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) <> 'object' or coalesce(r ->> 'chamber_no', '') !~ '^[0-9]{1,3}$' or coalesce(r ->> 'floor', '') !~ '^[0-9]{1,2}$' then
      raise exception 'Each chamber needs a number (1 to 999) and a floor (1 to 10)';
    end if;
    if coalesce(r ->> 'storage', '') not in ('bins', 'crates') then raise exception 'Each chamber holds bins or crates'; end if;
    keep := keep || ((r ->> 'chamber_no')::int || ':' || (r ->> 'floor')::int);
  end loop;
  if cardinality(keep) <> (select count(distinct k) from unnest(keep) k) then
    raise exception 'Two chambers have the same number. Give each chamber its own number.';
  end if;

  -- Floors no longer there go first (the chamber trigger refuses a booked one).
  delete from public.cold_chambers c
   where c.listing_id = p_listing and c.chamber_no is not null
     and not ((c.chamber_no || ':' || c.floor) = any (keep));

  -- Then every floor: changed in place, or added.
  for r in select * from jsonb_array_elements(p_rows) loop
    update public.cold_chambers c set
      name = r ->> 'name',
      position = (r ->> 'position')::int,
      rows = (r ->> 'rows')::int,
      cols = (r ->> 'cols')::int,
      boxes_per_slot = (r ->> 'boxes_per_slot')::int,
      blocked = coalesce((select array_agg(b) from jsonb_array_elements_text(coalesce(r -> 'blocked', '[]'::jsonb)) b), '{}'),
      storage = r ->> 'storage',
      unit_kg = (r ->> 'unit_kg')::numeric,
      capacity_mt = (r ->> 'capacity_mt')::numeric,
      rate = (r ->> 'rate')::numeric,
      size = r -> 'size'
     where c.listing_id = p_listing and c.chamber_no = (r ->> 'chamber_no')::int and c.floor = (r ->> 'floor')::int
     returning c.id into found_id;
    if found_id is null then
      insert into public.cold_chambers (listing_id, chamber_no, floor, name, position, rows, cols, boxes_per_slot, blocked, storage, unit_kg, capacity_mt, rate, size)
      values (
        p_listing, (r ->> 'chamber_no')::int, (r ->> 'floor')::int, r ->> 'name', (r ->> 'position')::int, (r ->> 'rows')::int, (r ->> 'cols')::int,
        (r ->> 'boxes_per_slot')::int,
        coalesce((select array_agg(b) from jsonb_array_elements_text(coalesce(r -> 'blocked', '[]'::jsonb)) b), '{}'),
        r ->> 'storage', (r ->> 'unit_kg')::numeric, (r ->> 'capacity_mt')::numeric, (r ->> 'rate')::numeric, r -> 'size'
      );
    end if;
    n := n + 1;
  end loop;

  -- The store's own rate (shown as "from ₹…"): the lowest chamber rate, unless
  -- older chambers (which use the store's rate) are still there.
  if not exists (select 1 from public.cold_chambers where listing_id = p_listing and chamber_no is null) then
    select min(rate) into lowest from public.cold_chambers where listing_id = p_listing and rate is not null;
    if lowest is not null then update public.rental_listings set rate = lowest where id = p_listing; end if;
  end if;
  return n;
end $$;
revoke execute on function public.kr_save_cold_chambers(uuid, jsonb) from public, anon;
grant execute on function public.kr_save_cold_chambers(uuid, jsonb) to authenticated;

-- ───────────────────────── what a booking costs ─────────────────────────
-- Once a booking's places are in: its boxes on each place × that chamber's
-- rate (else the store's) × months. Same as before for stores without
-- chamber rates.
create or replace function public.kr_cold_booking_amount() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.rental_bookings b
     set amount = round(b.duration * coalesce((
           select sum(coalesce(s.boxes, c.boxes_per_slot) * coalesce(c.rate, l.rate))
             from public.cold_slot_bookings s
             join public.cold_chambers c on c.id = s.chamber_id
             join public.rental_listings l on l.id = c.listing_id
            where s.booking_id = b.id), 0), 2)
   where b.id in (select distinct a.booking_id from added a);
  return null;
end $$;
revoke execute on function public.kr_cold_booking_amount() from public, anon, authenticated;
drop trigger if exists cold_slot_bookings_amount on public.cold_slot_bookings;
create trigger cold_slot_bookings_amount after insert on public.cold_slot_bookings
  referencing new table as added for each statement execute function public.kr_cold_booking_amount();

-- ════════ 20261025100000_cold_booking_pay.sql ════════
-- KashRoot: booking bins and crates in a cold store, paying the owner
-- directly, and the receipt the farmer shows at the store
-- (components/rental/ColdBooking, components/rental/receipt,
-- app/(dashboards)/rental/receipt/[id]).
--   rental_bookings     + paid_at (when the farmer said they paid and gave the
--                         payment reference), confirmed_at (when the owner
--                         pressed "Money received"), paid_to (whom the farmer
--                         was asked to pay at that moment: name, UPI ID, last 4
--                         digits of the account, IFSC, bank). Written only by
--                         the database.
--   cold_slot_bookings  + rate: the rupees a month for one bin / crate / box on
--                         that place when it was booked (the chamber's own
--                         rate, else the store's), so a receipt keeps the
--                         price even if the owner changes the rent later.
--   kr_book_cold_places   as before (24-hour hold, one booking at a time, a
--                         place never over full), but it speaks of bins,
--                         crates or boxes as each chamber holds them, names a
--                         place in words ("Chamber 1 · Floor 2 · Row 3, stack
--                         2"), and keeps each place's rate. The price is
--                         worked out here: bins on each place × that rate ×
--                         months (kr_cold_booking_amount).
--   kr_cold_free_now(stores)  per chamber floor: bins / crates free today.
--   kr_cold_receipt(booking)  everything the receipt shows — only to the farmer
--                         who booked and to the store's owner.
-- KashRoot never holds money: these only record what the farmer says they
-- paid directly to the owner, and what the owner confirmed.
-- Run after 20261025000000_cold_store_details.sql. Safe to run again.

-- ───────────────────────── words ─────────────────────────
-- "bin" / "bins", "crate" / "crates", "box" / "boxes".
create or replace function public.kr_cold_word(p_storage text, p_n integer) returns text
language sql immutable as $$
  select case coalesce(p_storage, 'boxes')
           when 'bins' then case when p_n = 1 then 'bin' else 'bins' end
           when 'crates' then case when p_n = 1 then 'crate' else 'crates' end
           else case when p_n = 1 then 'box' else 'boxes' end
         end
$$;

-- "Chamber 1 · Floor 2" + "3B" → "Chamber 1 · Floor 2 · Row 3, stack 2".
create or replace function public.kr_cold_place_name(p_chamber text, p_slot text) returns text
language sql immutable as $$
  select p_chamber || ' · Row ' || coalesce(substring(p_slot from '^[0-9]+'), '?') || ', stack ' || (ascii(right(p_slot, 1)) - 64)
$$;

-- ───────────────────────── what a booking records ─────────────────────────
alter table public.rental_bookings add column if not exists paid_at timestamptz;
alter table public.rental_bookings add column if not exists confirmed_at timestamptz;
alter table public.rental_bookings add column if not exists paid_to jsonb;
alter table public.cold_slot_bookings add column if not exists rate numeric(12, 2);
alter table public.cold_slot_bookings drop constraint if exists cold_slot_bookings_rate_check;
alter table public.cold_slot_bookings add constraint cold_slot_bookings_rate_check check (rate is null or rate >= 0);

-- Only the database writes when a booking was paid and confirmed, and whom
-- the farmer paid (the owner's payment details at that moment).
create or replace function public.kr_booking_stamps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.paid_at := null;
    new.confirmed_at := null;
    new.paid_to := null;
  else
    new.paid_at := old.paid_at;
    new.confirmed_at := old.confirmed_at;
    new.paid_to := old.paid_to;
  end if;
  if new.status = 'paid' and new.payment_ref is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'paid' or old.payment_ref is distinct from new.payment_ref) then
    new.paid_at := now();
    new.paid_to := (
      select jsonb_build_object('name', a.account_name, 'upi', a.upi_id, 'account_end', right(a.account_number, 4), 'ifsc', a.ifsc, 'bank', a.bank_name)
        from public.payout_accounts a where a.user_id = new.owner_id
    );
  end if;
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    new.confirmed_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.kr_booking_stamps() from public, anon, authenticated;
-- Runs after rental_bookings_before (which sets the owner) — triggers go in name order.
drop trigger if exists rental_bookings_stamps on public.rental_bookings;
create trigger rental_bookings_stamps before insert or update on public.rental_bookings
  for each row execute function public.kr_booking_stamps();

-- ───────────────────────── places in words ─────────────────────────
-- The first place of a booking that would hold more than it can (as before),
-- named in words for the farmer.
create or replace function public.kr_cold_over(p_booking uuid, p_firm boolean default false) returns text
language sql stable security definer set search_path = public as $$
  select public.kr_cold_place_name(c.name, s.slot)
    from public.cold_slot_bookings s
    join public.rental_bookings me on me.id = s.booking_id
    join public.cold_chambers c on c.id = s.chamber_id
   where s.booking_id = p_booking
     and coalesce(s.boxes, c.boxes_per_slot)
       + public.kr_cold_used(s.chamber_id, s.slot, public.kr_cold_period(me.start_date, me.duration), p_booking, p_firm) > c.boxes_per_slot
   limit 1
$$;
revoke execute on function public.kr_cold_over(uuid, boolean) from public, anon, authenticated;

-- ───────────────────────── booking ─────────────────────────
-- p_places: ['<chamber id>:3B:50', …] — a place and how many of the farmer's
-- bins / crates / boxes go on it (no count: the whole place). Returns the new
-- booking's id. The places are held for 24 hours while the farmer pays the
-- owner directly; the owner confirms when the money arrives.
create or replace function public.kr_book_cold_places(p_listing uuid, p_places text[], p_start date, p_months integer, p_name text, p_phone text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.rental_listings;
  c public.cold_chambers;
  item text;
  chamber_text text;
  place text;
  here text;
  count_text text;
  n integer;
  room integer;
  boxes integer := 0;
  seen text[] := '{}';
  kinds text[] := '{}';
  wanted jsonb := '[]'::jsonb;
  booking uuid;
  clash text;
begin
  if auth.uid() is null then raise exception 'Please sign in to book'; end if;
  if not public.kr_kyc_ok() then raise exception 'Verify your Aadhaar first (My details → Identity check), then book.'; end if;
  select * into l from public.rental_listings where id = p_listing;
  if not found or not l.active or l.kind <> 'cold_store' then raise exception 'This cold store is not taking bookings'; end if;
  if l.owner_id = auth.uid() then raise exception 'You cannot book your own cold store'; end if;
  if p_months is null or p_months not between 1 and 24 then raise exception 'Choose from 1 to 24 months'; end if;
  if p_start is null or p_start < current_date - 1 or p_start > current_date + 400 then raise exception 'Choose a start date from today'; end if;
  if coalesce(cardinality(p_places), 0) = 0 then raise exception 'Choose at least one place on the map'; end if;
  if cardinality(p_places) > 300 then raise exception 'Choose at most 300 places in one booking'; end if;

  -- One booking at a time per store, so a place can never be filled twice over.
  perform pg_advisory_xact_lock(hashtext('cold:' || p_listing::text));

  foreach item in array p_places loop
    chamber_text := split_part(item, ':', 1);
    place := upper(split_part(item, ':', 2));
    count_text := split_part(item, ':', 3);
    if chamber_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'That chamber is not part of this cold store. Close the window, open the store again and choose again.';
    end if;
    select * into c from public.cold_chambers where id = chamber_text::uuid and listing_id = p_listing;
    if not found then raise exception 'That chamber is not part of this cold store. Close the window, open the store again and choose again.'; end if;
    here := public.kr_cold_place_name(c.name, place);
    if not public.kr_cold_valid_slot(c, place) then raise exception '% cannot be booked. Please choose another place.', here; end if;
    if (c.id::text || ':' || place) = any (seen) then raise exception '% is chosen twice. Choose each place once.', here; end if;
    seen := seen || (c.id::text || ':' || place);
    if count_text !~ '^[0-9]{0,4}$' then raise exception 'Choose how many % go on %', public.kr_cold_word(c.storage, 2), here; end if;
    n := coalesce(nullif(count_text, '')::int, c.boxes_per_slot);
    if n < 1 or n > c.boxes_per_slot then
      raise exception '% holds % %. Choose from 1 to % for it.', here, c.boxes_per_slot, public.kr_cold_word(c.storage, c.boxes_per_slot), c.boxes_per_slot;
    end if;
    room := c.boxes_per_slot - public.kr_cold_used(c.id, place, public.kr_cold_period(p_start, p_months));
    if room <= 0 then
      raise exception '% was just taken by someone else. Please choose another place.', here;
    elsif n > room then
      raise exception '% was just partly taken by someone else: room is left for % %. Please choose again.', here, room, public.kr_cold_word(c.storage, room);
    end if;
    boxes := boxes + n;
    if not (c.storage = any (kinds)) then kinds := kinds || c.storage; end if;
    wanted := wanted || jsonb_build_object('chamber', c.id, 'slot', place, 'boxes', n, 'rate', coalesce(c.rate, l.rate));
  end loop;
  if boxes < l.min_units then
    raise exception 'This cold store takes at least % % in one booking', l.min_units,
      case when cardinality(kinds) = 1 then public.kr_cold_word(kinds[1], l.min_units) else 'bins or crates' end;
  end if;

  perform set_config('kr.cold_slots', 'on', true);
  insert into public.rental_bookings (listing_id, renter_id, renter_name, renter_phone, units, duration, start_date, status)
  values (p_listing, auth.uid(), left(trim(p_name), 80), left(regexp_replace(p_phone, '\s', '', 'g'), 20), boxes, p_months, p_start, 'requested')
  returning id into booking;
  perform set_config('kr.cold_slots', 'off', true);

  -- The price is set by cold_slot_bookings_amount once the places are in.
  insert into public.cold_slot_bookings (booking_id, chamber_id, slot, boxes, rate)
  select booking, (w ->> 'chamber')::uuid, w ->> 'slot', (w ->> 'boxes')::int, (w ->> 'rate')::numeric from jsonb_array_elements(wanted) w;

  clash := public.kr_cold_over(booking, false);
  if clash is not null then raise exception '% was just taken by someone else. Please choose another place.', clash; end if;
  return booking;
end $$;
revoke execute on function public.kr_book_cold_places(uuid, text[], date, integer, text, text) from public, anon;
grant execute on function public.kr_book_cold_places(uuid, text[], date, integer, text, text) to authenticated;

-- What a booking costs, once its places are in: the bins on each place × the
-- rate kept on that place (the chamber's own, else the store's) × months.
create or replace function public.kr_cold_booking_amount() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.rental_bookings b
     set amount = round(b.duration * coalesce((
           select sum(coalesce(s.boxes, c.boxes_per_slot) * coalesce(s.rate, c.rate, l.rate))
             from public.cold_slot_bookings s
             join public.cold_chambers c on c.id = s.chamber_id
             join public.rental_listings l on l.id = c.listing_id
            where s.booking_id = b.id), 0), 2)
   where b.id in (select distinct a.booking_id from added a);
  return null;
end $$;
revoke execute on function public.kr_cold_booking_amount() from public, anon, authenticated;
drop trigger if exists cold_slot_bookings_amount on public.cold_slot_bookings;
create trigger cold_slot_bookings_amount after insert on public.cold_slot_bookings
  referencing new table as added for each statement execute function public.kr_cold_booking_amount();

-- ───────────────────────── free now ─────────────────────────
-- For the store cards: bins / crates / boxes still free today on each chamber
-- floor (places held for payment count as taken). Never says who.
create or replace function public.kr_cold_free_now(p_listings uuid[])
returns table (chamber_id uuid, free integer)
language sql stable security definer set search_path = public as $$
  select c.id,
         greatest(0, (c.rows * c.cols - cardinality(c.blocked)) * c.boxes_per_slot - coalesce((
           select sum(coalesce(s.boxes, c.boxes_per_slot))
             from public.cold_slot_bookings s
             join public.rental_bookings b on b.id = s.booking_id
            where s.chamber_id = c.id
              and public.kr_cold_holds(b.status, b.created_at)
              and public.kr_cold_period(b.start_date, b.duration) @> current_date), 0))::int
    from public.cold_chambers c
    join public.rental_listings l on l.id = c.listing_id
   where c.listing_id = any ((coalesce(p_listings, '{}'::uuid[]))[1:200])
     and (l.active or l.owner_id = auth.uid())
$$;
revoke execute on function public.kr_cold_free_now(uuid[]) from public;
grant execute on function public.kr_cold_free_now(uuid[]) to anon, authenticated;

-- ───────────────────────── the receipt ─────────────────────────
-- Everything the receipt shows, as JSON — only for the farmer who booked
-- ('farmer') and the store's owner ('owner'); anyone else gets null.
create or replace function public.kr_cold_receipt(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.rental_bookings;
  l public.rental_listings;
  viewer text;
begin
  if auth.uid() is null or p_booking is null then return null; end if;
  select * into b from public.rental_bookings where id = p_booking;
  if not found then return null; end if;
  viewer := case when b.renter_id = auth.uid() then 'farmer' when b.owner_id = auth.uid() then 'owner' end;
  if viewer is null then return null; end if;
  select * into l from public.rental_listings where id = b.listing_id;
  return jsonb_build_object(
    'viewer', viewer,
    'booking', jsonb_build_object(
      'id', b.id, 'status', b.status, 'units', b.units, 'months', b.duration, 'start', b.start_date, 'amount', b.amount,
      'payment_ref', b.payment_ref, 'created_at', b.created_at, 'paid_at', b.paid_at, 'confirmed_at', b.confirmed_at,
      'paid_to', b.paid_to, 'farmer_name', b.renter_name, 'farmer_phone', b.renter_phone, 'owner_note', b.owner_note),
    'store', jsonb_build_object(
      'title', l.title, 'owner_name', l.owner_name, 'phone', l.phone, 'manager_name', l.manager_name, 'manager_phone', l.manager_phone,
      'address', l.address, 'area', l.area, 'district', l.district, 'state', l.state, 'rate', l.rate, 'unit', l.unit),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'chamber_id', c.id, 'name', c.name, 'chamber_no', c.chamber_no, 'floor', c.floor, 'position', c.position,
               'storage', c.storage, 'boxes_per_slot', c.boxes_per_slot, 'slot', s.slot,
               'boxes', coalesce(s.boxes, c.boxes_per_slot), 'rate', coalesce(s.rate, c.rate, l.rate), 'rate_kept', s.rate is not null)
             order by c.position, c.name, s.slot)
        from public.cold_slot_bookings s
        join public.cold_chambers c on c.id = s.chamber_id
       where s.booking_id = b.id), '[]'::jsonb)
  );
end $$;
revoke execute on function public.kr_cold_receipt(uuid) from public, anon;
grant execute on function public.kr_cold_receipt(uuid) to authenticated;

-- ════════ 20261026000000_shop_orders.sql ════════
-- Kissan Tools shop: farm tools and inputs with up to three photos, and
-- pay-first orders with shipping and live delivery tracking.
--
--   * market_listings.photos: up to three photos (data URLs). The old single
--     photo column stays and always holds the first photo, so older pages and
--     older rows keep working.
--   * market_orders, pay_first (Kissan Tools only — Price Comparison and the
--     Buyer portal stay pay-after-delivery). One checkout to one seller is one
--     basket: each product line is a row with the same basket id, and every
--     step moves the whole basket:
--       placed → seller accepts (stock checked and reserved; needs the
--       seller's payout details) → buyer pays the seller directly by UPI or
--       bank and enters the reference (payment_state 'paid') → seller
--       confirms the money arrived ('received') → seller ships (vehicle or
--       courier, driver) and the vehicle's position comes from the seller's
--       phone or the driver's tracking link → buyer presses "I received it"
--       (completed). KashRoot never holds the money.
--   * market_order_drivers: the driver's tracking-link token per basket. No
--     direct access: only the functions below read or use it.
--   * market_listings.photo_at: when the photos last changed, so a list that
--     refreshes often fetches a photo again only when it is new.
--   * market_orders.seller_name / seller_phone / seller_district: who sells
--     it, copied when the order is made, so the buyer keeps the name and the
--     call button even if the product is hidden or removed later.
-- Safe to run again; no existing row changes.

-- ───────────────────────── listing photos ─────────────────────────
alter table public.market_listings add column if not exists photos text[];
alter table public.market_listings add column if not exists photo_at timestamptz;

create or replace function public.kr_photos_ok(p text[]) returns boolean
language sql immutable set search_path = public as $$
  select p is null or (
    cardinality(p) <= 3
    and not exists (select 1 from unnest(p) x where x is null or x not like 'data:image/%' or char_length(x) > 600000)
  )
$$;
alter table public.market_listings drop constraint if exists market_listings_photos_check;
alter table public.market_listings add constraint market_listings_photos_check check (public.kr_photos_ok(photos));

-- photo is always the first of photos. A page that only knows the single
-- photo still works: what it sets becomes the first photo. photo_at moves
-- only when the photos change (not with the price or the stock).
create or replace function public.kr_listing_photos() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(cardinality(new.photos), 0) > 0 then new.photo := new.photos[1];
    elsif new.photo is not null then new.photos := array[new.photo];
    else new.photos := null;
    end if;
    new.photo_at := case when new.photo is not null then now() end;
    return new;
  end if;
  if new.photos is distinct from old.photos then
    new.photo := case when coalesce(cardinality(new.photos), 0) > 0 then new.photos[1] end;
    if coalesce(cardinality(new.photos), 0) = 0 then new.photos := null; end if;
  elsif new.photo is distinct from old.photo then
    new.photos := case when new.photo is null then null else array[new.photo] || coalesce(old.photos[2:3], '{}') end;
  end if;
  new.photo_at := case when new.photo is distinct from old.photo or new.photos is distinct from old.photos then now() else old.photo_at end;
  return new;
end $$;
drop trigger if exists market_listings_photos on public.market_listings;
create trigger market_listings_photos before insert or update on public.market_listings for each row execute function public.kr_listing_photos();

-- ───────────────────────── pay-first orders ─────────────────────────
alter table public.market_orders add column if not exists pay_first boolean not null default false;
alter table public.market_orders add column if not exists basket uuid;
alter table public.market_orders add column if not exists payment_state text;
alter table public.market_orders add column if not exists paid_at timestamptz;
alter table public.market_orders add column if not exists payment_confirmed_at timestamptz;
alter table public.market_orders add column if not exists delivery_lat double precision;
alter table public.market_orders add column if not exists delivery_lon double precision;
alter table public.market_orders add column if not exists ship_vehicle text;
alter table public.market_orders add column if not exists driver_name text;
alter table public.market_orders add column if not exists driver_phone text;
alter table public.market_orders add column if not exists shipped_at timestamptz;
alter table public.market_orders add column if not exists last_lat double precision;
alter table public.market_orders add column if not exists last_lon double precision;
alter table public.market_orders add column if not exists last_accuracy real;
alter table public.market_orders add column if not exists last_at timestamptz;
alter table public.market_orders add column if not exists delivered_at timestamptz;
alter table public.market_orders add column if not exists seller_name text;
alter table public.market_orders add column if not exists seller_phone text;
alter table public.market_orders add column if not exists seller_district text;

alter table public.market_orders drop constraint if exists market_orders_payment_state_check;
alter table public.market_orders add constraint market_orders_payment_state_check check (payment_state is null or payment_state in ('unpaid', 'paid', 'received'));
alter table public.market_orders drop constraint if exists market_orders_delivery_point_check;
alter table public.market_orders add constraint market_orders_delivery_point_check
  check ((delivery_lat is null and delivery_lon is null) or (delivery_lat between -90 and 90 and delivery_lon between -180 and 180));
alter table public.market_orders drop constraint if exists market_orders_last_point_check;
alter table public.market_orders add constraint market_orders_last_point_check
  check ((last_lat is null and last_lon is null) or (last_lat between -90 and 90 and last_lon between -180 and 180));
alter table public.market_orders drop constraint if exists market_orders_ship_vehicle_check;
alter table public.market_orders add constraint market_orders_ship_vehicle_check check (ship_vehicle is null or char_length(ship_vehicle) between 2 and 40);
alter table public.market_orders drop constraint if exists market_orders_driver_name_check;
alter table public.market_orders add constraint market_orders_driver_name_check check (driver_name is null or char_length(driver_name) <= 80);
alter table public.market_orders drop constraint if exists market_orders_driver_phone_check;
alter table public.market_orders add constraint market_orders_driver_phone_check check (driver_phone is null or driver_phone ~ '^[6-9][0-9]{9}$');
create index if not exists market_orders_basket on public.market_orders (basket) where basket is not null;

-- The driver's tracking link: one per basket (or per order without a basket).
create table if not exists public.market_order_drivers (
  basket     uuid primary key,
  token      text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);
alter table public.market_order_drivers enable row level security;
revoke all on public.market_order_drivers from anon, authenticated;

-- New orders: the price, seller and product come from the listing (and the
-- seller's name, mobile and district are kept on the order). Pay first is
-- only for farm tools and inputs, and a basket holds one buyer's products
-- from one seller. Nothing about payment or shipping can be set by the buyer.
create or replace function public.kr_before_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.market_listings; other public.market_orders;
begin
  select * into l from public.market_listings where id = new.listing_id;
  if not found or not l.active then raise exception 'This product is no longer listed'; end if;
  if l.seller_id = new.buyer_id then raise exception 'You cannot order your own product'; end if;
  if new.quantity > l.quantity then
    raise exception 'Only % % of % left. Order % or less.', trim_scale(l.quantity), l.unit, l.product, trim_scale(l.quantity);
  end if;
  new.seller_id := l.seller_id;
  new.seller_name := l.seller_name;
  new.seller_phone := l.phone;
  new.seller_district := l.district;
  new.product := l.product || coalesce(' · ' || l.variety, '');
  new.unit := l.unit;
  new.unit_price := l.price;
  new.amount := round(l.price * new.quantity, 2);
  new.status := 'placed';
  new.payment_ref := null;
  new.seller_note := null;
  new.pay_first := coalesce(new.pay_first, false);
  if new.pay_first then
    if l.category <> 'supplies' then raise exception 'Paying first is only for farm tools and inputs'; end if;
    new.basket := coalesce(new.basket, gen_random_uuid());
    select * into other from public.market_orders where basket = new.basket limit 1;
    if found and (other.buyer_id <> new.buyer_id or other.seller_id <> new.seller_id or other.status <> 'placed' or not other.pay_first) then
      raise exception 'One order can hold products from one seller only';
    end if;
    new.payment_state := 'unpaid';
  else
    new.basket := null;
    new.payment_state := null;
  end if;
  new.paid_at := null;
  new.payment_confirmed_at := null;
  new.shipped_at := null;
  new.delivered_at := null;
  new.ship_vehicle := null;
  new.driver_name := null;
  new.driver_phone := null;
  new.last_lat := null;
  new.last_lon := null;
  new.last_accuracy := null;
  new.last_at := null;
  return new;
end $$;

-- Puts a basket's reserved stock back: an accepted order that is cancelled,
-- or stopped by "Report a problem" before it was shipped (the goods are
-- still with the seller).
create or replace function public.kr_shop_restock(p_basket uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.market_orders;
begin
  for r in select * from public.market_orders where basket = p_basket loop
    update public.market_listings set quantity = quantity + r.quantity where id = r.listing_id;
  end loop;
end $$;

-- One step of a pay-first order; the whole basket moves together. Called
-- from kr_order_action after it has checked who is asking.
create or replace function public.kr_shop_step(o public.market_orders, p_action text, p_ref text, p_note text)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare r public.market_orders; l public.market_listings; b uuid := o.basket;
begin
  perform 1 from public.market_orders where basket = b for update;
  if p_action = 'accept' then
    if o.status <> 'placed' then raise exception 'This order is already %', o.status; end if;
    if not exists (select 1 from public.payout_accounts where user_id = o.seller_id) then
      raise exception 'Add where buyers pay you first (UPI ID or bank account). Then accept the order.';
    end if;
    for r in select * from public.market_orders where basket = b order by created_at loop
      select * into l from public.market_listings where id = r.listing_id for update;
      if found then
        if l.quantity < r.quantity then
          raise exception 'Only % % of % left in stock. Add stock first, or decline the order.', trim_scale(l.quantity), l.unit, l.product;
        end if;
        update public.market_listings set quantity = quantity - r.quantity where id = l.id;
      end if;
    end loop;
    update public.market_orders set status = 'accepted', seller_note = coalesce(left(p_note, 300), seller_note) where basket = b;
  elsif p_action = 'reject' then
    if o.status <> 'placed' then raise exception 'This order is already %', o.status; end if;
    update public.market_orders set status = 'rejected', seller_note = left(p_note, 300) where basket = b;
  elsif p_action = 'cancel' then
    if o.status = 'placed' then
      update public.market_orders set status = 'cancelled' where basket = b;
    elsif o.status = 'accepted' and o.payment_state = 'unpaid' then
      perform public.kr_shop_restock(b);
      update public.market_orders set status = 'cancelled' where basket = b;
    elsif o.status = 'accepted' then
      raise exception 'You have already paid for this order. Call the seller, or press “Report a problem”.';
    else
      raise exception 'This order is already %. It cannot be cancelled now.', o.status;
    end if;
  elsif p_action = 'seller_cancel' then
    if not (o.status = 'accepted' and o.payment_state = 'unpaid') then raise exception 'You can cancel only while the buyer has not paid'; end if;
    -- The buyer gave a payment reference: the seller cannot just cancel it away.
    if o.payment_ref is not null then
      raise exception 'The buyer says they paid (reference %). Check your bank or UPI app again, or call the buyer. If the money did not come, press “Report a problem”.', o.payment_ref;
    end if;
    perform public.kr_shop_restock(b);
    update public.market_orders set status = 'cancelled', seller_note = coalesce(left(p_note, 300), 'Cancelled by the seller: the payment did not come.') where basket = b;
  elsif p_action = 'pay' then
    if o.status = 'placed' then raise exception 'Wait until the seller accepts the order. Then pay.'; end if;
    if o.status <> 'accepted' then raise exception 'This order is already %', o.status; end if;
    if o.payment_state = 'received' then raise exception 'The seller has already confirmed your payment'; end if;
    if p_ref is null or p_ref !~ '^[A-Za-z0-9]{6,30}$' then
      raise exception 'Enter the payment reference (UTR) from your UPI app or bank: 6 to 30 letters or numbers, no spaces.';
    end if;
    -- A new payment: an older "money not received" note no longer applies.
    update public.market_orders set payment_state = 'paid', payment_ref = p_ref, paid_at = now(), seller_note = null where basket = b;
  elsif p_action in ('confirm_payment', 'not_received') then
    -- "Money received" also works after "not received", when the money came late.
    if o.status <> 'accepted' or not (o.payment_state = 'paid' or (p_action = 'confirm_payment' and o.payment_state = 'unpaid' and o.payment_ref is not null)) then
      raise exception 'The buyer has not marked this order paid yet';
    end if;
    if p_action = 'confirm_payment' then
      update public.market_orders set payment_state = 'received', payment_confirmed_at = now(), seller_note = null where basket = b;
    else
      update public.market_orders set payment_state = 'unpaid', seller_note = coalesce(left(p_note, 300), 'The money has not reached the seller yet.') where basket = b;
    end if;
  elsif p_action = 'ship' then
    raise exception 'Write the vehicle or courier first, then press “Mark shipped”';
  elsif p_action = 'delivered' then
    if o.status <> 'shipped' then raise exception 'The seller has not shipped this order yet'; end if;
    update public.market_orders set status = 'completed', delivered_at = now() where basket = b;
  elsif p_action in ('dispute', 'seller_dispute') then
    -- "Report a problem", by the buyer or (for a payment the seller cannot
    -- find) the seller. KashRoot's admins see it. Not shipped yet: the goods
    -- are still with the seller, so their stock goes back on sale.
    if o.status = 'placed' then raise exception 'The seller has not accepted this order yet. Press “Cancel order” instead.'; end if;
    if o.status = 'disputed' then raise exception 'A problem is already reported on this order.'; end if;
    if o.status not in ('accepted', 'shipped') then raise exception 'This order is already %. A problem cannot be reported now.', o.status; end if;
    if btrim(coalesce(p_note, '')) = '' then raise exception 'Write what went wrong, for example: wrong item, broken, not delivered, money not received.'; end if;
    if o.status = 'accepted' then perform public.kr_shop_restock(b); end if;
    if p_action = 'dispute' then
      update public.market_orders set status = 'disputed', buyer_note = left(btrim(p_note), 300) where basket = b;
    else
      update public.market_orders set status = 'disputed', seller_note = left(btrim(p_note), 300) where basket = b;
    end if;
  end if;
  select * into r from public.market_orders where id = o.id;
  return r;
end $$;

-- Pay after delivery (Price Comparison, Buyer portal), unchanged: seller
-- accept → ship; buyer confirms delivery → pays the seller directly and
-- enters the reference → seller confirms. Pay-first orders go to kr_shop_step.
create or replace function public.kr_order_action(p_order uuid, p_action text, p_ref text default null, p_note text default null)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders; l public.market_listings;
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if p_action in ('accept', 'reject', 'ship', 'confirm_payment', 'not_received', 'seller_cancel', 'seller_dispute') then
    if o.seller_id is distinct from auth.uid() then raise exception 'Only the seller can do this'; end if;
  elsif p_action in ('cancel', 'delivered', 'pay', 'dispute') then
    if o.buyer_id is distinct from auth.uid() then raise exception 'Only the buyer can do this'; end if;
  else
    raise exception 'Unknown action';
  end if;
  if o.pay_first and o.basket is not null then return public.kr_shop_step(o, p_action, p_ref, p_note); end if;
  if p_action in ('not_received', 'seller_cancel', 'seller_dispute') then raise exception 'Unknown action'; end if;

  if p_action = 'accept' then
    if o.status <> 'placed' then raise exception 'Order is already %', o.status; end if;
    select * into l from public.market_listings where id = o.listing_id for update;
    if found then
      if l.quantity < o.quantity then raise exception 'Only % % left in stock', l.quantity, l.unit; end if;
      update public.market_listings set quantity = quantity - o.quantity where id = l.id;
    end if;
    update public.market_orders set status = 'accepted', seller_note = left(p_note, 300) where id = p_order returning * into o;
  elsif p_action = 'reject' then
    if o.status <> 'placed' then raise exception 'Order is already %', o.status; end if;
    update public.market_orders set status = 'rejected', seller_note = left(p_note, 300) where id = p_order returning * into o;
  elsif p_action = 'ship' then
    if o.status <> 'accepted' then raise exception 'Accept the order first'; end if;
    update public.market_orders set status = 'shipped', shipped_at = now(), seller_note = coalesce(left(p_note, 300), seller_note) where id = p_order returning * into o;
  elsif p_action = 'cancel' then
    if o.status <> 'placed' then raise exception 'The seller has already accepted this order'; end if;
    update public.market_orders set status = 'cancelled' where id = p_order returning * into o;
  elsif p_action = 'delivered' then
    if o.status not in ('accepted', 'shipped') then raise exception 'Order is %', o.status; end if;
    update public.market_orders set status = 'delivered', delivered_at = now() where id = p_order returning * into o;
  elsif p_action = 'pay' then
    if o.status not in ('delivered', 'paid') then raise exception 'Confirm the delivery first'; end if;
    if p_ref is null or p_ref !~ '^[A-Za-z0-9]{6,30}$' then raise exception 'Enter the 12-digit UPI reference (UTR) from your payment app'; end if;
    update public.market_orders set status = 'paid', payment_ref = p_ref, paid_at = now() where id = p_order returning * into o;
  elsif p_action = 'dispute' then
    if o.status in ('completed', 'cancelled', 'rejected') then raise exception 'Order is %', o.status; end if;
    update public.market_orders set status = 'disputed', buyer_note = left(p_note, 300) where id = p_order returning * into o;
  elsif p_action = 'confirm_payment' then
    if o.status <> 'paid' then raise exception 'The buyer has not marked this order paid yet'; end if;
    update public.market_orders set status = 'completed', payment_confirmed_at = now() where id = p_order returning * into o;
  end if;
  return o;
end $$;

-- The seller ships: vehicle number or courier, and the driver (optional).
-- A pay-first order ships only after the seller confirmed the money arrived.
-- Called again on a shipped order, it corrects the details.
create or replace function public.kr_order_ship(p_order uuid, p_vehicle text, p_driver_name text default null, p_driver_phone text default null, p_note text default null)
returns public.market_orders language plpgsql security definer set search_path = public as $$
declare o public.market_orders; v text := btrim(coalesce(p_vehicle, '')); ph text := regexp_replace(coalesce(p_driver_phone, ''), '\D', '', 'g');
begin
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.seller_id is distinct from auth.uid() then raise exception 'Only the seller can do this'; end if;
  if o.status not in ('accepted', 'shipped') then raise exception 'This order is %. It cannot be shipped now.', o.status; end if;
  if o.pay_first and o.status = 'accepted' and o.payment_state is distinct from 'received' then
    raise exception 'Ship after the money reaches you. First press “Money received”.';
  end if;
  if char_length(v) < 2 or char_length(v) > 40 then
    raise exception 'Write the vehicle number or the courier name (for example JK01 AB 1234, or India Post).';
  end if;
  if char_length(ph) = 12 and ph like '91%' then ph := substr(ph, 3); end if;
  if ph <> '' and ph !~ '^[6-9][0-9]{9}$' then
    raise exception 'Write the driver’s 10-digit mobile number (for example 9876543210), or leave it empty.';
  end if;
  update public.market_orders
     set status = 'shipped', shipped_at = coalesce(shipped_at, now()), ship_vehicle = upper(v),
         driver_name = nullif(left(btrim(coalesce(p_driver_name, '')), 80), ''), driver_phone = nullif(ph, ''),
         seller_note = coalesce(left(nullif(btrim(p_note), ''), 300), seller_note)
   where (o.basket is not null and basket = o.basket) or (o.basket is null and id = o.id);
  select * into o from public.market_orders where id = p_order;
  return o;
end $$;

-- Where the vehicle is now, from the seller's phone. At most one update every 10 seconds.
create or replace function public.kr_order_location(p_order uuid, p_lat double precision, p_lon double precision, p_accuracy real default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare o public.market_orders;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Bad location'; end if;
  select * into o from public.market_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.seller_id is distinct from auth.uid() then raise exception 'Only the seller can do this'; end if;
  if o.status = 'accepted' or o.status = 'placed' then raise exception 'Share the location after the order is shipped'; end if;
  if o.status <> 'shipped' then raise exception 'This order is not on the way any more. Sharing the location has stopped.'; end if;
  if o.last_at is not null and o.last_at > now() - interval '10 seconds' then return o.last_at; end if;
  update public.market_orders set last_lat = p_lat, last_lon = p_lon, last_accuracy = p_accuracy, last_at = now()
   where (o.basket is not null and basket = o.basket) or (o.basket is null and id = o.id);
  return now();
end $$;

-- The seller's link for the driver (makes one the first time).
create or replace function public.kr_order_driver_link(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o public.market_orders; k uuid; t text;
begin
  select * into o from public.market_orders where id = p_order;
  if not found then raise exception 'Order not found'; end if;
  if o.seller_id is distinct from auth.uid() then raise exception 'Only the seller can do this'; end if;
  if o.status not in ('accepted', 'shipped') or (o.pay_first and o.status = 'accepted' and o.payment_state is distinct from 'received') then
    raise exception 'Make the driver link when the order is ready to ship';
  end if;
  k := coalesce(o.basket, o.id);
  insert into public.market_order_drivers (basket) values (k) on conflict (basket) do nothing;
  select token into t from public.market_order_drivers where basket = k;
  return t;
end $$;

-- The driver's page (no sign-in; the token is the key): what to deliver and where.
create or replace function public.kr_order_driver_view(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', o.status, 'delivery_address', o.delivery_address, 'delivery_lat', o.delivery_lat, 'delivery_lon', o.delivery_lon,
    'buyer_name', o.buyer_name, 'buyer_phone', o.buyer_phone, 'ship_vehicle', o.ship_vehicle, 'last_at', o.last_at,
    'items', (select jsonb_agg(jsonb_build_object('product', x.product, 'quantity', x.quantity, 'unit', x.unit) order by x.created_at)
                from public.market_orders x where x.basket = d.basket or x.id = d.basket))
  from public.market_order_drivers d
  join lateral (select * from public.market_orders m where m.basket = d.basket or m.id = d.basket order by m.created_at limit 1) o on true
  where p_token is not null and char_length(p_token) >= 32 and d.token = p_token
$$;

-- The driver's phone sends its position (only while the order is on the way).
create or replace function public.kr_order_driver_ping(p_token text, p_lat double precision, p_lon double precision, p_accuracy real default null)
returns text language plpgsql security definer set search_path = public as $$
declare k uuid; o public.market_orders;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then raise exception 'Bad location'; end if;
  select basket into k from public.market_order_drivers where p_token is not null and char_length(p_token) >= 32 and token = p_token;
  if k is null then raise exception 'This driver link is not valid. Ask the seller for a new one.'; end if;
  select * into o from public.market_orders where basket = k or id = k order by created_at limit 1 for update;
  if not found then raise exception 'This driver link is not valid. Ask the seller for a new one.'; end if;
  if o.status <> 'shipped' then return o.status; end if;
  if o.last_at is not null and o.last_at > now() - interval '10 seconds' then return o.status; end if;
  update public.market_orders set last_lat = p_lat, last_lon = p_lon, last_accuracy = p_accuracy, last_at = now()
   where basket = k or id = k;
  return 'shipped';
end $$;

-- ───────────────────────── grants ─────────────────────────
revoke execute on function public.kr_shop_step(public.market_orders, text, text, text) from public, anon, authenticated;
revoke execute on function public.kr_shop_restock(uuid) from public, anon, authenticated;
revoke execute on function public.kr_order_action(uuid, text, text, text) from public, anon;
revoke execute on function public.kr_order_ship(uuid, text, text, text, text) from public, anon;
revoke execute on function public.kr_order_location(uuid, double precision, double precision, real) from public, anon;
revoke execute on function public.kr_order_driver_link(uuid) from public, anon;
grant execute on function public.kr_order_action(uuid, text, text, text), public.kr_order_ship(uuid, text, text, text, text),
  public.kr_order_location(uuid, double precision, double precision, real), public.kr_order_driver_link(uuid) to authenticated;
grant execute on function public.kr_order_driver_view(text), public.kr_order_driver_ping(text, double precision, double precision, real) to anon, authenticated;

-- ════════ 20261027000000_pan_and_signin.sql ════════
-- KashRoot: a PAN counts as verified only when its number was really read.
-- Before this, a DigiLocker sign-in where the person only ALLOWED sharing a
-- PAN (without having one in DigiLocker) recorded "PAN verified" with no PAN
-- number, and Admin → Accounts showed "PAN ✓" for people with no PAN card.
--   1. kr_record_kyc refuses a PAN without the last four characters of the
--      PAN number (read from the Income Tax record or the DigiLocker PAN card).
--   2. Those wrong records are cleared (the PAN part only; Aadhaar stays).
--   3. The table itself refuses "PAN verified" without the last four.
--   4. Admin → Accounts counts PAN only with its last four, and shows the
--      last four of the PAN and the Aadhaar so an admin can check them. It
--      also lists every account now (it stopped at 2,000 before, so the
--      least recently active people could not be found).
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
    -- Every account (no cap): Admin → Accounts reads them page by page. The
    -- id keeps the order the same between pages.
    order by coalesce(greatest(a.last_sign_in_at, a.renewed), a.joined_at) desc, a.id;
end $$;
revoke execute on function public.kr_admin_accounts() from public, anon;
grant execute on function public.kr_admin_accounts() to authenticated;

-- ════════ 20261028000000_buyer_shop_verified_sellers.sql ════════
-- Buyer shop: the "Verified seller" badge for farmers too.
--
-- Until now only dealers and admins counted as verified, so a farmer who had
-- finished the identity check (Aadhaar) never showed the badge in the Buyer
-- portal's shop or on Price Comparison, and "Verified sellers only" hid every
-- farmer. A seller now counts as verified when KashRoot has checked their
-- Aadhaar, or when they are a dealer (or admin).
--
-- It returns only ids, never Aadhaar details. The Aadhaar part answers only
-- for people who have a product on sale, so it cannot be used to ask about
-- any account.
--
-- Safe to run again: create or replace, and grants that can be repeated.

create or replace function public.kr_verified_sellers(p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.staff_roles
   where user_id = any(p_ids) and role in ('DEALER', 'ADMIN')
  union
  select k.user_id from public.identity_checks k
   where k.user_id = any(p_ids)
     and k.aadhaar_verified_at is not null
     and exists (select 1 from public.market_listings l where l.seller_id = k.user_id and l.active)
$$;

revoke all on function public.kr_verified_sellers(uuid[]) from public;
grant execute on function public.kr_verified_sellers(uuid[]) to anon, authenticated;

-- ════════ 20261029000000_official_registry.sql ════════
-- KashRoot TrueScan: the official lists of registered products.
--   official_products  products the Government lists as registered or
--                      specified — e.g. the CIB&RC list of registered
--                      pesticides (registration numbers "CIR-12345/2019-…",
--                      the product and the registrant company) or a
--                      Fertiliser (Control) Order list. The KashRoot admin
--                      imports each list from the file the Government
--                      publishes, always with its name and link (source,
--                      source_url). Nothing here is typed in by KashRoot.
-- Everyone (signed in or not) can read the lists and search them; only an
-- admin imports or removes a list. The Government publishes no list of
-- batch numbers, so there is none here.
-- Run after 20261028000000_buyer_shop_verified_sellers.sql. Safe to run again.

-- ── How registration numbers and names are compared ──
-- A registration number as it is compared: capitals, "34,927" → "34927",
-- every run of other characters → one "-", "Reg. No." and the "CIR" in front
-- left out. "CIR-12345/2019-Mancozeb (WP)" and "cir 12345 / 2019 mancozeb wp"
-- both become "12345-2019-MANCOZEB-WP".
-- (Used by stored columns below: if it ever changes, run
-- "update public.official_products set name = name" to recompute them.)
create or replace function public.kr_reg_core(p text) returns text
language sql immutable parallel safe set search_path = public as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        trim(both '-' from regexp_replace(regexp_replace(upper(coalesce(p, '')), '([0-9]),([0-9])', '\1\2', 'g'), '[^A-Z0-9]+', '-', 'g')),
        '^(REGISTRATION|REGN|REG)(-(NUMBER|NO|NR))?-', ''),
      '^CIR-?(?=[0-9])', ''),
    '')
$$;

-- The number and year of a CIB&RC registration ("12345-2019"), which stay the
-- same however the rest of it is printed on the label.
create or replace function public.kr_reg_num(p text) returns text
language sql immutable parallel safe set search_path = public as $$
  select substring(public.kr_reg_core(p) from '^([0-9]+-(?:19|20)[0-9]{2})(?:-|$)')
$$;

-- Words for the name search: small letters and numbers only ("Lambda-cyhalothrin
-- 5% EC" → "lambda cyhalothrin 5 ec").
create or replace function public.kr_words(p text) returns text
language sql immutable parallel safe set search_path = public as $$
  select trim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

create table if not exists public.official_products (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('pesticide', 'fertiliser', 'seed', 'other')),
  name            text not null check (char_length(trim(name)) between 2 and 300),
  registration_no text check (registration_no is null or char_length(registration_no) between 1 and 200),
  registrant      text check (registrant is null or char_length(registrant) <= 200),
  details         jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  source          text not null check (char_length(trim(source)) between 2 and 200),
  source_url      text not null check (source_url ~ '^https?://' and char_length(source_url) <= 500),
  imported_at     timestamptz not null default now(),
  imported_by     uuid default auth.uid() references auth.users (id) on delete set null
);
-- For the search (kept by the database itself, never sent to anyone).
alter table public.official_products add column if not exists reg_core text generated always as (public.kr_reg_core(registration_no)) stored;
alter table public.official_products add column if not exists reg_num text generated always as (public.kr_reg_num(registration_no)) stored;
alter table public.official_products add column if not exists search_words tsvector generated always as (
  to_tsvector('simple'::regconfig, public.kr_words(name || ' ' || coalesce(registrant, '') || ' ' || coalesce(details ->> 'brand', '') || ' ' || coalesce(details ->> 'formulation', '')))
) stored;

-- One row per product in a list: importing the same file again adds nothing twice.
create unique index if not exists official_products_one on public.official_products
  (kind, source, (coalesce(reg_core, '')), (lower(name)), (lower(coalesce(registrant, ''))));
create index if not exists official_products_reg_core on public.official_products (reg_core text_pattern_ops);
create index if not exists official_products_reg_num on public.official_products (reg_num) where reg_num is not null;
create index if not exists official_products_words on public.official_products using gin (search_words);
create index if not exists official_products_source on public.official_products (source, kind);

alter table public.official_products enable row level security;

-- Everyone reads the lists — but not which admin imported them.
revoke all on public.official_products from anon, authenticated;
grant select (id, kind, name, registration_no, registrant, details, source, source_url, imported_at) on public.official_products to anon, authenticated;
grant insert, update, delete on public.official_products to authenticated;

drop policy if exists official_products_read on public.official_products;
create policy official_products_read on public.official_products for select to anon, authenticated using (true);
drop policy if exists official_products_admin on public.official_products;
create policy official_products_admin on public.official_products for all to authenticated
  using (public.kr_has_role('ADMIN')) with check (public.kr_has_role('ADMIN'));

-- ── Admin: import a list, in batches ──
-- p_rows: [{name, registration_no, registrant, details}]. Rows already in this
-- list are kept and marked as seen in this import (imported_at). Returns how
-- many rows were new.
create or replace function public.kr_registry_import(p_rows jsonb, p_kind text, p_source text, p_source_url text)
returns integer
language plpgsql security definer set search_path = public as $$
declare added integer;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can import an official list'; end if;
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
revoke execute on function public.kr_registry_import(jsonb, text, text, text) from public, anon;
grant execute on function public.kr_registry_import(jsonb, text, text, text) to authenticated;

-- Admin: remove a whole list (by its name; one kind or all). Returns how many rows went.
create or replace function public.kr_registry_remove(p_source text, p_kind text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can remove an official list'; end if;
  delete from public.official_products where source = p_source and (p_kind is null or kind = p_kind);
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke execute on function public.kr_registry_remove(text, text) from public, anon;
grant execute on function public.kr_registry_remove(text, text) to authenticated;

-- ── Everyone: search ──
-- What is printed on the label: a registration number (exact, or the same
-- number written another way) first, then products whose name has every word
-- typed. At most 20 rows.
create or replace function public.kr_registry_search(p_text text)
returns table (kind text, name text, registration_no text, registrant text, details jsonb, source text, source_url text, imported_at timestamptz, matched text)
language plpgsql stable security definer set search_path = public as $$
declare
  q text := left(trim(coalesce(p_text, '')), 200);
  core text := public.kr_reg_core(q);
  num text := public.kr_reg_num(q);
  parts text[] := string_to_array(public.kr_reg_core(q), '-');
  heads text[];
  words text[];
  tsq tsquery;
begin
  if char_length(q) < 2 then return; end if;
  -- The beginnings of what was typed ("12345-2019-MANCOZEB-WP-4" also tries
  -- "12345-2019-MANCOZEB-WP"), so a number printed with more after it still matches.
  if coalesce(array_length(parts, 1), 0) >= 2 then
    select array_agg(array_to_string(parts[1:i], '-')) into heads from generate_series(2, array_length(parts, 1)) i;
  end if;
  select array_agg(w) into words from (select w from unnest(string_to_array(public.kr_words(q), ' ')) w where w <> '' limit 8) s;
  if words is not null then
    tsq := to_tsquery('simple', array_to_string(array(select w || ':*' from unnest(words) w), ' & '));
  end if;
  return query
  with reg as (
    select o.id, case when o.reg_core = core then 0 else 1 end as rank
      from public.official_products o
     where core is not null
       and (o.reg_core = core
            or (num is not null and o.reg_num = num)
            or o.reg_core = any(heads)
            or (char_length(core) >= 6 and o.reg_core like core || '-%'))
     order by 2, o.imported_at desc
     limit 20
  ), nm as (
    select o.id,
           case when lower(o.name) = lower(q) then 2
                when public.kr_words(o.name) like public.kr_words(q) || '%' then 3
                else 4 end as rank
      from public.official_products o
     where tsq is not null and o.search_words @@ tsq and o.id not in (select reg.id from reg)
     order by 2, char_length(o.name), o.name
     limit 20
  ), hits as (
    select * from reg union all select * from nm
  )
  select o.kind, o.name, o.registration_no, o.registrant, o.details, o.source, o.source_url, o.imported_at,
         case when h.rank <= 1 then 'registration' else 'name' end
    from hits h join public.official_products o on o.id = h.id
   order by h.rank, char_length(o.name), o.name, o.imported_at desc
   limit 20;
end $$;
revoke all on function public.kr_registry_search(text) from public;
grant execute on function public.kr_registry_search(text) to anon, authenticated;

-- Everyone: what the lists hold — rows per kind, the last import, and each
-- list with its source, link and date. {"total": 0, …} before any import.
create or replace function public.kr_registry_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  with l as (
    select kind, source, max(source_url) as url, count(*) as n, max(imported_at) as last
      from public.official_products group by kind, source
  )
  select jsonb_build_object(
    'total', coalesce((select sum(n) from l), 0),
    'last_import', (select max(last) from l),
    'kinds', coalesce((
      select jsonb_object_agg(kind, jsonb_build_object('count', n, 'last_import', last))
        from (select kind, sum(n) as n, max(last) as last from l group by kind) k
    ), '{}'::jsonb),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'source', source, 'source_url', url, 'count', n, 'imported_at', last) order by last desc) from l
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.kr_registry_stats() from public;
grant execute on function public.kr_registry_stats() to anon, authenticated;

-- ════════ 20261030000000_cold_store_photos.sql ════════
-- KashRoot: real photos of a cold store, added by its owner, so a farmer sees
-- the store as it is beside the drawing, the 3D view and the walk inside.
--   rental_listings.photos  up to 8 photos: [{src, note}], src a JPEG / PNG /
--                           WebP data URL made smaller on the phone (at most
--                           about 450 KB each), note a few words ("Main door",
--                           "Chamber 2, bins") of at most 80 letters.
-- Read only when a farmer opens the store (never with the list of stores).
-- The owner changes them like the rest of the store ("Owners edit listings");
-- anyone who can see the store sees them ("Anyone browses active listings").
-- Run after 20261029000000_official_registry.sql. Safe to run again.

alter table public.rental_listings add column if not exists photos jsonb;

create or replace function public.kr_store_photos_ok(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select p is null or (
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) <= 8
    and not exists (
      select 1 from jsonb_array_elements(p) x
      where jsonb_typeof(x) <> 'object'
         or jsonb_typeof(x -> 'src') is distinct from 'string'
         or (x ->> 'src') !~ '^data:image/(jpeg|png|webp);base64,'
         or char_length(x ->> 'src') > 460000
         or (x ? 'note' and jsonb_typeof(x -> 'note') not in ('string', 'null'))
         or char_length(coalesce(x ->> 'note', '')) > 80
    )
  )
$$;

alter table public.rental_listings drop constraint if exists rental_listings_photos_check;
alter table public.rental_listings add constraint rental_listings_photos_check check (public.kr_store_photos_ok(photos));

notify pgrst, 'reload schema';

-- ════════ Make kashroot08@gmail.com the owner admin, and check everything ════════
-- The site reads the new tables and columns at once.
notify pgrst, 'reload schema';
-- One row below. "admin" says "Done" — or, if that account does not exist yet,
-- create it on the website first (any portal) and run this file again. Every
-- other column should say "yes". A "NO" means Supabase stopped before that
-- part: the error it showed (in red, with a line number) says why.
select
  public.kr_make_admin('kashroot08@gmail.com') as admin,
  case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rental_listings' and column_name = 'building') then 'yes' else 'NO' end as cold_store_details,
  case when exists (select 1 from pg_proc where proname = 'kr_cold_receipt') then 'yes' else 'NO' end as cold_booking_pay,
  case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'market_listings' and column_name = 'photos') then 'yes' else 'NO' end as shop_orders,
  case when exists (select 1 from pg_proc where proname = 'kr_admin_accounts') then 'yes' else 'NO' end as pan_and_signin,
  case when exists (select 1 from pg_proc where proname = 'kr_verified_sellers') then 'yes' else 'NO' end as buyer_shop,
  case when to_regclass('public.official_products') is not null then 'yes' else 'NO' end as truescan_lists,
  case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rental_listings' and column_name = 'photos') then 'yes' else 'NO' end as store_photos;
