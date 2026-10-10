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
  role       text not null check (role in ('ADMIN', 'EXPERT', 'DEALER')),
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
  role       text not null check (role in ('EXPERT', 'DEALER')),
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
  if p_role not in ('EXPERT', 'DEALER') then raise exception 'Unknown role'; end if;
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
  if p_role not in ('ADMIN', 'EXPERT', 'DEALER') then raise exception 'Unknown role'; end if;
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
