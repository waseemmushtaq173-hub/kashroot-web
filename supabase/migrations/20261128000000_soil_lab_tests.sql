-- KashRoot: soil and lab tests. Labs and soil-testing professionals join as a kind of business ("soil_lab"), with their
-- own business admin (people, owners and staff). A farmer books a test, the lab is told by email, comes to the field on
-- the day it chose, takes the sample, uploads the report on KashRoot, the farmer reads it and can ask an expert about it.
--   lab_profiles   where the lab is, the districts it serves, whether it visits the field, its phone
--   lab_tests      what it tests and charges: a name, the sample kind, a price, a visit fee, days to the report
--   lab_bookings   a farmer's request: the test, where to come (words and, if given, the phone's position), the day and
--                  part of the day wanted; then accepted with a visit time, sample collected, report ready, or declined
--   lab_reports    the lab's result for one booking: the values, remarks and the lab's own file (PDF or photo)
--   advisory_requests.lab_booking_id   a farmer's question to the experts about a report; the expert may then read it
-- Rules, in the database:
--   * nobody writes these tables directly: only these functions. A lab's people (owner, manager, staff) act for the lab;
--     only the owner or a manager changes the lab's details and prices; staff take requests and upload reports;
--   * a farmer sees only their own bookings and reports; a lab only its own; the Super Admin all (read); an expert only the
--     report of a booking whose farmer asked them about it. The report's file is fetched on its own, never in lists;
--   * a suspended business (the Super Admin's lever) changes nothing;
--   * a farmer cannot book a lab they belong to, may have at most 10 open requests, and can book only a lab that serves
--     their district;
--   * the lab is emailed on a new request (and when the farmer cancels), the farmer on each step and when the report is
--     ready: through the email queue (20261108000000_email_outbox.sql), carrying only the booking code and the test
--     and district, never a name, phone, address or any value from the report.
-- Run after 20261127000000_hub_orders_section.sql. Safe to run again.

alter table public.organisations drop constraint if exists organisations_kind_check;
alter table public.organisations add constraint organisations_kind_check check (kind in ('cold_store', 'dealer', 'shop', 'helper', 'soil_lab'));

-- The email kinds: the one complete list (newest: this one).
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'help_new', 'help_ack', 'help_reply', 'help_resolved', 'payout_changed', 'password_changed', 'email_changed', 'phone_changed', 'new_signin', 'signin_locked', 'team_changed', 'trip_lost',
  'lab_booking_new', 'lab_booking_cancelled', 'lab_booking_update', 'lab_report_ready'));

create table if not exists public.lab_profiles (
  org_id     uuid primary key references public.organisations (id) on delete cascade,
  districts  text[] not null check (cardinality(districts) between 1 and 30),
  address    text not null check (char_length(btrim(address)) between 5 and 300),
  phone      text check (phone is null or phone ~ '^[0-9+ -]{8,15}$'),
  home_visit boolean not null default true,
  about      text check (about is null or char_length(about) <= 600),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_tests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 3 and 120),
  sample_kind text not null check (sample_kind in ('soil', 'water', 'leaf', 'fertiliser', 'pesticide', 'other')),
  price       numeric(10, 2) not null check (price >= 0 and price <= 100000),
  visit_fee   numeric(10, 2) not null default 0 check (visit_fee >= 0 and visit_fee <= 10000),
  days        integer not null check (days between 1 and 60),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists lab_tests_org on public.lab_tests (org_id, active);

create table if not exists public.lab_bookings (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default ('LT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  farmer_id      uuid not null references auth.users (id) on delete cascade,
  org_id         uuid not null references public.organisations (id) on delete cascade,
  test_id        uuid references public.lab_tests (id) on delete set null,
  test_name      text not null,
  sample_kind    text not null,
  price          numeric(10, 2) not null,
  visit_fee      numeric(10, 2) not null default 0,
  farmer_name    text not null check (char_length(btrim(farmer_name)) between 1 and 80),
  farmer_phone   text not null check (farmer_phone ~ '^[6-9][0-9]{9}$'),
  district       text not null check (char_length(btrim(district)) between 2 and 60),
  crop           text check (crop is null or char_length(crop) <= 60),
  visit_address  text not null check (char_length(btrim(visit_address)) between 5 and 300),
  visit_lat      numeric(9, 6) check (visit_lat is null or visit_lat between -90 and 90),
  visit_lng      numeric(9, 6) check (visit_lng is null or visit_lng between -180 and 180),
  preferred_date date not null,
  preferred_slot text not null default 'any' check (preferred_slot in ('morning', 'afternoon', 'evening', 'any')),
  note           text check (note is null or char_length(note) <= 500),
  status         text not null default 'requested' check (status in ('requested', 'accepted', 'sample_collected', 'report_ready', 'declined', 'cancelled')),
  scheduled_for  timestamptz,
  lab_note       text check (lab_note is null or char_length(lab_note) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((visit_lat is null) = (visit_lng is null))
);
create index if not exists lab_bookings_farmer on public.lab_bookings (farmer_id, created_at desc);
create index if not exists lab_bookings_org on public.lab_bookings (org_id, status, created_at desc);

create table if not exists public.lab_reports (
  booking_id  uuid primary key references public.lab_bookings (id) on delete cascade,
  org_id      uuid not null references public.organisations (id) on delete cascade,
  farmer_id   uuid not null references auth.users (id) on delete cascade,
  report_no   text check (report_no is null or char_length(report_no) <= 40),
  tested_on   date,
  results     jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array' and jsonb_array_length(results) <= 40),
  remarks     text check (remarks is null or char_length(remarks) <= 2000),
  file_name   text check (file_name is null or char_length(file_name) <= 100),
  file_data   text check (file_data is null or (file_data ~ '^data:(application/pdf|image/(jpeg|png|webp));base64,' and char_length(file_data) <= 3000000)),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (jsonb_array_length(results) > 0 or file_data is not null)
);

alter table public.advisory_requests add column if not exists lab_booking_id uuid references public.lab_bookings (id) on delete set null;

alter table public.lab_profiles enable row level security;
alter table public.lab_tests enable row level security;
alter table public.lab_bookings enable row level security;
alter table public.lab_reports enable row level security;
revoke all on public.lab_profiles, public.lab_tests, public.lab_bookings, public.lab_reports from anon, authenticated;

drop trigger if exists lab_profiles_touch on public.lab_profiles;
create trigger lab_profiles_touch before update on public.lab_profiles for each row execute function public.kr_touch();
drop trigger if exists lab_tests_touch on public.lab_tests;
create trigger lab_tests_touch before update on public.lab_tests for each row execute function public.kr_touch();
drop trigger if exists lab_bookings_touch on public.lab_bookings;
create trigger lab_bookings_touch before update on public.lab_bookings for each row execute function public.kr_touch();
drop trigger if exists lab_reports_touch on public.lab_reports;
create trigger lab_reports_touch before update on public.lab_reports for each row execute function public.kr_touch();

-- Is the caller one of this lab's people (and may they manage it)? Raises a plain sentence when not.
create or replace function public.kr_lab_org_ok(p_org uuid, p_manage boolean) returns void
language plpgsql stable security definer set search_path = public as $$
declare r text := public.kr_org_role(p_org);
begin
  if not exists (select 1 from public.organisations where id = p_org and kind = 'soil_lab') then
    raise exception 'This is not a lab or soil-testing business.' using errcode = '42501';
  end if;
  if r is null then raise exception 'Only the people of this lab can do this.' using errcode = '42501'; end if;
  if p_manage and r = 'staff' then raise exception 'Only the owner or a manager can change the lab''s details and prices.' using errcode = '42501'; end if;
  perform public.kr_org_writable(p_org);
end $$;
revoke all on function public.kr_lab_org_ok(uuid, boolean) from public, anon, authenticated;

-- The lab's details: where it is, the districts it serves, its phone.
create or replace function public.kr_lab_save_profile(p_org uuid, p_districts text[], p_address text, p_phone text, p_home_visit boolean, p_about text) returns void
language plpgsql security definer set search_path = public as $$
declare d text[]; addr text := btrim(coalesce(p_address, '')); ph text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  perform public.kr_lab_org_ok(p_org, true);
  select coalesce(array_agg(distinct btrim(x)), '{}') into d from unnest(coalesce(p_districts, '{}')) x where char_length(btrim(x)) between 2 and 60;
  if cardinality(d) = 0 then raise exception 'Choose the districts your lab serves.'; end if;
  if char_length(addr) < 5 then raise exception 'Write the lab''s address (at least 5 letters).'; end if;
  if ph is not null and ph !~ '^[0-9+ -]{8,15}$' then raise exception 'Write the lab''s phone number with digits only (8 to 15).'; end if;
  insert into public.lab_profiles (org_id, districts, address, phone, home_visit, about)
  values (p_org, d, left(addr, 300), ph, coalesce(p_home_visit, true), left(nullif(btrim(coalesce(p_about, '')), ''), 600))
  on conflict (org_id) do update set districts = excluded.districts, address = excluded.address, phone = excluded.phone, home_visit = excluded.home_visit, about = excluded.about;
end $$;
revoke all on function public.kr_lab_save_profile(uuid, text[], text, text, boolean, text) from public, anon;
grant execute on function public.kr_lab_save_profile(uuid, text[], text, text, boolean, text) to authenticated;

-- A test the lab offers (new when p_id is null).
create or replace function public.kr_lab_save_test(p_org uuid, p_id uuid, p_name text, p_sample text, p_price numeric, p_visit_fee numeric, p_days integer, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare nm text := btrim(coalesce(p_name, '')); tid uuid;
begin
  perform public.kr_lab_org_ok(p_org, true);
  if char_length(nm) < 3 then raise exception 'Write the name of the test (at least 3 letters), for example "Soil: pH, EC, organic carbon, N, P, K".'; end if;
  if p_sample is null or p_sample not in ('soil', 'water', 'leaf', 'fertiliser', 'pesticide', 'other') then raise exception 'Choose what is tested: soil, water, leaf, fertiliser or pesticide.'; end if;
  if p_price is null or p_price < 0 or p_price > 100000 then raise exception 'Write the price in rupees (0 to 1,00,000).'; end if;
  if coalesce(p_visit_fee, 0) < 0 or coalesce(p_visit_fee, 0) > 10000 then raise exception 'Write the visit fee in rupees (0 to 10,000).'; end if;
  if p_days is null or p_days < 1 or p_days > 60 then raise exception 'Write how many days the report takes (1 to 60).'; end if;
  if p_id is null then
    insert into public.lab_tests (org_id, name, sample_kind, price, visit_fee, days, active)
    values (p_org, left(nm, 120), p_sample, p_price, coalesce(p_visit_fee, 0), p_days, coalesce(p_active, true)) returning id into tid;
  else
    update public.lab_tests set name = left(nm, 120), sample_kind = p_sample, price = p_price, visit_fee = coalesce(p_visit_fee, 0), days = p_days, active = coalesce(p_active, true)
     where id = p_id and org_id = p_org returning id into tid;
    if tid is null then raise exception 'That test was not found.'; end if;
  end if;
  return tid;
end $$;
revoke all on function public.kr_lab_save_test(uuid, uuid, text, text, numeric, numeric, integer, boolean) from public, anon;
grant execute on function public.kr_lab_save_test(uuid, uuid, text, text, numeric, numeric, integer, boolean) to authenticated;

-- The lab's own details and tests (its people only), for its admin page.
create or replace function public.kr_lab_mine(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.kr_lab_org_ok(p_org, false);
  return jsonb_build_object(
    'profile', (select to_jsonb(p) - 'updated_at' from public.lab_profiles p where p.org_id = p_org),
    'tests', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'sample_kind', t.sample_kind, 'price', t.price, 'visit_fee', t.visit_fee, 'days', t.days, 'active', t.active) order by t.created_at), '[]'::jsonb)
              from public.lab_tests t where t.org_id = p_org));
end $$;
revoke all on function public.kr_lab_mine(uuid) from public, anon;
grant execute on function public.kr_lab_mine(uuid) to authenticated;

-- Labs a farmer can book: not suspended, with their details and at least one active test; for a district when given.
create or replace function public.kr_lab_directory(p_district text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'org_id', o.id, 'name', o.name, 'address', p.address, 'phone', p.phone, 'districts', p.districts, 'home_visit', p.home_visit, 'about', p.about,
      'tests', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'sample_kind', t.sample_kind, 'price', t.price, 'visit_fee', t.visit_fee, 'days', t.days) order by t.name), '[]'::jsonb)
                from public.lab_tests t where t.org_id = o.id and t.active)
    ) order by o.name), '[]'::jsonb)
  from public.organisations o join public.lab_profiles p on p.org_id = o.id
  where auth.uid() is not null
    and o.kind = 'soil_lab' and o.suspended_at is null
    and exists (select 1 from public.lab_tests t where t.org_id = o.id and t.active)
    and (p_district is null or btrim(p_district) = '' or exists (select 1 from unnest(p.districts) d where lower(d) = lower(btrim(p_district))))
$$;
revoke all on function public.kr_lab_directory(text) from public, anon;
grant execute on function public.kr_lab_directory(text) to authenticated;

-- A farmer books a test. The lab is told by email; the booking code is the reference both sides use.
create or replace function public.kr_lab_book(
  p_test uuid, p_name text, p_phone text, p_district text, p_crop text, p_address text, p_lat numeric, p_lng numeric, p_date date, p_slot text, p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t public.lab_tests; o public.organisations; pr public.lab_profiles; b public.lab_bookings;
  nm text := btrim(coalesce(p_name, '')); ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); dist text := btrim(coalesce(p_district, ''));
  addr text := btrim(coalesce(p_address, '')); today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into t from public.lab_tests where id = p_test and active;
  if not found then raise exception 'This test is not offered any more. Choose another.'; end if;
  select * into o from public.organisations where id = t.org_id;
  if o.kind <> 'soil_lab' or o.suspended_at is not null then raise exception 'This lab is not taking bookings now.'; end if;
  select * into pr from public.lab_profiles where org_id = o.id;
  if not found then raise exception 'This lab is not taking bookings now.'; end if;
  if public.kr_org_role(o.id) is not null then raise exception 'You work at this lab: you cannot book a test with it.'; end if;
  if char_length(nm) < 1 or char_length(nm) > 80 then raise exception 'Write your name.'; end if;
  if length(ph) = 12 and ph like '91%' then ph := substr(ph, 3); end if;
  if ph !~ '^[6-9][0-9]{9}$' then raise exception 'Write your 10-digit mobile number: the lab will call you.'; end if;
  if char_length(dist) < 2 then raise exception 'Choose your district.'; end if;
  if not exists (select 1 from unnest(pr.districts) d where lower(d) = lower(dist)) then
    raise exception '% does not serve %. Choose a lab that does.', o.name, dist;
  end if;
  if char_length(addr) < 5 then raise exception 'Write where the lab should come: the village, the orchard or field and a landmark.'; end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'The position given is not valid.'; end if;
  if p_date is null or p_date < today or p_date > today + 60 then raise exception 'Choose a day from today to the next 60 days.'; end if;
  if coalesce(p_slot, 'any') not in ('morning', 'afternoon', 'evening', 'any') then raise exception 'Choose morning, afternoon, evening or any time.'; end if;
  if (select count(*) from public.lab_bookings where farmer_id = auth.uid() and status in ('requested', 'accepted')) >= 10 then
    raise exception 'You already have 10 open test requests. Wait for some to finish or cancel one.';
  end if;
  insert into public.lab_bookings (farmer_id, org_id, test_id, test_name, sample_kind, price, visit_fee, farmer_name, farmer_phone, district, crop, visit_address, visit_lat, visit_lng, preferred_date, preferred_slot, note)
  values (auth.uid(), o.id, t.id, t.name, t.sample_kind, t.price, case when pr.home_visit then t.visit_fee else 0 end, left(nm, 80), ph, left(dist, 60), left(nullif(btrim(coalesce(p_crop, '')), ''), 60),
          left(addr, 300), round(p_lat, 6), round(p_lng, 6), p_date, coalesce(p_slot, 'any'), left(nullif(btrim(coalesce(p_note, '')), ''), 500))
  returning * into b;
  insert into public.email_outbox (kind, user_id, ref, detail)
  select 'lab_booking_new', m.user_id, b.code, left(b.test_name || ' · ' || b.district, 80) from public.org_members m where m.org_id = b.org_id;
  return b.id;
end $$;
revoke all on function public.kr_lab_book(uuid, text, text, text, text, text, numeric, numeric, date, text, text) from public, anon;
grant execute on function public.kr_lab_book(uuid, text, text, text, text, text, numeric, numeric, date, text, text) to authenticated;

-- The farmer's own bookings.
create or replace function public.kr_lab_my_bookings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'code', b.code, 'test_name', b.test_name, 'sample_kind', b.sample_kind, 'price', b.price, 'visit_fee', b.visit_fee, 'status', b.status,
      'district', b.district, 'crop', b.crop, 'visit_address', b.visit_address, 'preferred_date', b.preferred_date, 'preferred_slot', b.preferred_slot,
      'scheduled_for', b.scheduled_for, 'lab_note', b.lab_note, 'created_at', b.created_at,
      'lab_name', o.name, 'lab_phone', p.phone, 'lab_address', p.address,
      'has_report', exists (select 1 from public.lab_reports r where r.booking_id = b.id),
      'asked_expert', exists (select 1 from public.advisory_requests a where a.lab_booking_id = b.id)
    ) order by b.created_at desc), '[]'::jsonb)
  from public.lab_bookings b join public.organisations o on o.id = b.org_id left join public.lab_profiles p on p.org_id = b.org_id
  where b.farmer_id = auth.uid()
$$;
revoke all on function public.kr_lab_my_bookings() from public, anon;
grant execute on function public.kr_lab_my_bookings() to authenticated;

-- The lab's requests, with what its people need to go and collect the sample (only its own people).
create or replace function public.kr_lab_org_bookings(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.kr_lab_org_ok(p_org, false);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'code', b.code, 'test_name', b.test_name, 'sample_kind', b.sample_kind, 'price', b.price, 'visit_fee', b.visit_fee, 'status', b.status,
      'farmer_name', b.farmer_name, 'farmer_phone', b.farmer_phone, 'district', b.district, 'crop', b.crop, 'visit_address', b.visit_address,
      'visit_lat', b.visit_lat, 'visit_lng', b.visit_lng, 'preferred_date', b.preferred_date, 'preferred_slot', b.preferred_slot, 'note', b.note,
      'scheduled_for', b.scheduled_for, 'lab_note', b.lab_note, 'created_at', b.created_at,
      'has_report', exists (select 1 from public.lab_reports r where r.booking_id = b.id)
    ) order by case b.status when 'requested' then 0 when 'accepted' then 1 when 'sample_collected' then 2 else 3 end, b.created_at desc), '[]'::jsonb)
    from (select * from public.lab_bookings where org_id = p_org order by created_at desc limit 500) b);
end $$;
revoke all on function public.kr_lab_org_bookings(uuid) from public, anon;
grant execute on function public.kr_lab_org_bookings(uuid) to authenticated;

-- The lab accepts (with the visit time), says the sample was collected, or declines (with a reason). The farmer is emailed.
create or replace function public.kr_lab_set_status(p_booking uuid, p_status text, p_when timestamptz default null, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b public.lab_bookings; why text := nullif(btrim(coalesce(p_note, '')), ''); what text;
begin
  select * into b from public.lab_bookings where id = p_booking for update;
  if not found then raise exception 'That booking was not found.'; end if;
  perform public.kr_lab_org_ok(b.org_id, false);
  if p_status = 'accepted' then
    if b.status not in ('requested', 'accepted') then raise exception 'This request is already %.', replace(b.status, '_', ' '); end if;
    if p_when is null or p_when < now() - interval '1 hour' then raise exception 'Choose the date and time you will come.'; end if;
    update public.lab_bookings set status = 'accepted', scheduled_for = p_when, lab_note = left(why, 500) where id = b.id;
    what := 'Accepted: visit ' || to_char(p_when at time zone 'Asia/Kolkata', 'DD Mon HH24:MI');
  elsif p_status = 'sample_collected' then
    if b.status <> 'accepted' then raise exception 'Accept the request first.'; end if;
    update public.lab_bookings set status = 'sample_collected' where id = b.id;
    what := 'Sample collected: the report will follow';
  elsif p_status = 'declined' then
    if b.status not in ('requested', 'accepted') then raise exception 'This request is already %.', replace(b.status, '_', ' '); end if;
    if why is null or char_length(why) < 5 then raise exception 'Write why you cannot take it (at least 5 letters): the farmer reads it.'; end if;
    update public.lab_bookings set status = 'declined', lab_note = left(why, 500), scheduled_for = null where id = b.id;
    what := 'Declined by the lab';
  else
    raise exception 'Unknown step.';
  end if;
  insert into public.email_outbox (kind, user_id, ref, detail) values ('lab_booking_update', b.farmer_id, b.code, left(what, 80));
end $$;
revoke all on function public.kr_lab_set_status(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.kr_lab_set_status(uuid, text, timestamptz, text) to authenticated;

-- The farmer cancels, before the sample is collected. The lab's people are emailed.
create or replace function public.kr_lab_cancel(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.lab_bookings;
begin
  select * into b from public.lab_bookings where id = p_booking and farmer_id = auth.uid() for update;
  if not found then raise exception 'That is not your booking.' using errcode = '42501'; end if;
  if b.status not in ('requested', 'accepted') then raise exception 'It is too late to cancel: this test is %.', replace(b.status, '_', ' '); end if;
  update public.lab_bookings set status = 'cancelled' where id = b.id;
  insert into public.email_outbox (kind, user_id, ref, detail)
  select 'lab_booking_cancelled', m.user_id, b.code, left(b.test_name || ' · ' || b.district, 80) from public.org_members m where m.org_id = b.org_id;
end $$;
revoke all on function public.kr_lab_cancel(uuid) from public, anon;
grant execute on function public.kr_lab_cancel(uuid) to authenticated;

-- The lab uploads the report: the values, remarks and its own file. The farmer is emailed.
create or replace function public.kr_lab_add_report(p_booking uuid, p_report_no text, p_tested_on date, p_results jsonb, p_remarks text, p_file_name text, p_file_data text) returns void
language plpgsql security definer set search_path = public as $$
declare b public.lab_bookings; x jsonb; clean jsonb := '[]'::jsonb; par text; val text; unit text; rate text; file text := nullif(p_file_data, '');
begin
  select * into b from public.lab_bookings where id = p_booking for update;
  if not found then raise exception 'That booking was not found.'; end if;
  perform public.kr_lab_org_ok(b.org_id, false);
  if b.status not in ('accepted', 'sample_collected', 'report_ready') then raise exception 'The report can be added after the request is accepted.'; end if;
  if p_results is not null and jsonb_typeof(p_results) <> 'array' then raise exception 'The values must be a list.'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    if jsonb_typeof(x) <> 'object' then raise exception 'Each value needs a name and a number.'; end if;
    par := btrim(coalesce(x ->> 'parameter', '')); val := btrim(coalesce(x ->> 'value', '')); unit := btrim(coalesce(x ->> 'unit', '')); rate := btrim(coalesce(x ->> 'rating', ''));
    if par = '' and val = '' then continue; end if;
    if char_length(par) not between 1 and 60 then raise exception 'Each value needs a name (up to 60 letters), for example "pH".'; end if;
    if char_length(val) not between 1 and 30 then raise exception 'Write the value of "%" (up to 30 characters).', par; end if;
    if char_length(unit) > 20 or char_length(rate) > 20 then raise exception 'The unit and the rating are short words (up to 20 letters).'; end if;
    clean := clean || jsonb_build_array(jsonb_build_object('parameter', par, 'value', val, 'unit', unit, 'rating', rate));
  end loop;
  if jsonb_array_length(clean) > 40 then raise exception 'Up to 40 values in one report.'; end if;
  if jsonb_array_length(clean) = 0 and file is null then raise exception 'Add the values, or the lab''s own file (PDF or photo).'; end if;
  if file is not null and (file !~ '^data:(application/pdf|image/(jpeg|png|webp));base64,' or char_length(file) > 3000000) then
    raise exception 'The file must be a PDF or a photo (JPG, PNG or WebP) of up to 2 MB.';
  end if;
  insert into public.lab_reports (booking_id, org_id, farmer_id, report_no, tested_on, results, remarks, file_name, file_data, uploaded_by)
  values (b.id, b.org_id, b.farmer_id, left(nullif(btrim(coalesce(p_report_no, '')), ''), 40), p_tested_on, clean, left(nullif(btrim(coalesce(p_remarks, '')), ''), 2000),
          case when file is null then null else left(nullif(btrim(coalesce(p_file_name, '')), ''), 100) end, file, auth.uid())
  on conflict (booking_id) do update set report_no = excluded.report_no, tested_on = excluded.tested_on, results = excluded.results, remarks = excluded.remarks,
    file_name = excluded.file_name, file_data = excluded.file_data, uploaded_by = excluded.uploaded_by;
  update public.lab_bookings set status = 'report_ready' where id = b.id;
  insert into public.email_outbox (kind, user_id, ref, detail) values ('lab_report_ready', b.farmer_id, b.code, left(b.test_name, 80));
end $$;
revoke all on function public.kr_lab_add_report(uuid, text, date, jsonb, text, text, text) from public, anon;
grant execute on function public.kr_lab_add_report(uuid, text, date, jsonb, text, text, text) to authenticated;

-- May the caller read this booking's report? Its farmer, the lab's people, the Super Admin, or an expert the farmer asked.
create or replace function public.kr_lab_can_read(p_booking uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lab_bookings b
    where b.id = p_booking
      and (b.farmer_id = auth.uid()
           or public.kr_org_role(b.org_id) is not null
           or public.kr_is_super_admin()
           or (public.kr_has_role('EXPERT') and exists (select 1 from public.advisory_requests a where a.lab_booking_id = b.id))))
$$;
revoke all on function public.kr_lab_can_read(uuid) from public, anon, authenticated;

-- The report without its file (null when there is none yet).
create or replace function public.kr_lab_report(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b public.lab_bookings; r public.lab_reports;
begin
  if not public.kr_lab_can_read(p_booking) then raise exception 'You cannot read this report.' using errcode = '42501'; end if;
  select * into b from public.lab_bookings where id = p_booking;
  select * into r from public.lab_reports where booking_id = p_booking;
  if not found then return null; end if;
  return jsonb_build_object(
    'booking_id', b.id, 'code', b.code, 'test_name', b.test_name, 'sample_kind', b.sample_kind, 'crop', b.crop, 'district', b.district,
    'lab_name', (select name from public.organisations where id = b.org_id),
    'report_no', r.report_no, 'tested_on', r.tested_on, 'results', r.results, 'remarks', r.remarks,
    'file_name', r.file_name, 'has_file', r.file_data is not null, 'uploaded_at', r.updated_at);
end $$;
revoke all on function public.kr_lab_report(uuid) from public, anon;
grant execute on function public.kr_lab_report(uuid) to authenticated;

-- The lab's own file, fetched alone (it can be large).
create or replace function public.kr_lab_report_file(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.lab_reports;
begin
  if not public.kr_lab_can_read(p_booking) then raise exception 'You cannot read this report.' using errcode = '42501'; end if;
  select * into r from public.lab_reports where booking_id = p_booking and file_data is not null;
  if not found then return null; end if;
  return jsonb_build_object('name', coalesce(r.file_name, 'report'), 'data', r.file_data);
end $$;
revoke all on function public.kr_lab_report_file(uuid) from public, anon;
grant execute on function public.kr_lab_report_file(uuid) to authenticated;

-- The farmer asks the experts about a report: one question on the advisory desk, carrying the values. The expert can read
-- the report for as long as it is there (kr_lab_can_read). Asking again returns the open question.
create or replace function public.kr_lab_ask_expert(p_booking uuid, p_question text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b public.lab_bookings; r public.lab_reports; rid uuid; summary text; msg text; q text := btrim(coalesce(p_question, ''));
begin
  select * into b from public.lab_bookings where id = p_booking and farmer_id = auth.uid();
  if not found then raise exception 'That is not your test.' using errcode = '42501'; end if;
  select * into r from public.lab_reports where booking_id = b.id;
  if not found then raise exception 'The lab has not uploaded the report yet.'; end if;
  select a.id into rid from public.advisory_requests a where a.lab_booking_id = b.id and a.status <> 'closed' order by a.created_at desc limit 1;
  if rid is not null then return rid; end if;
  select string_agg((x.v ->> 'parameter') || ' ' || (x.v ->> 'value') || coalesce(' ' || nullif(x.v ->> 'unit', ''), ''), '; ' order by x.n)
    into summary from (select v, n from jsonb_array_elements(r.results) with ordinality as e(v, n) order by n limit 12) x;
  msg := left((case when q = '' then 'Please read my lab report and tell me what to do.' else left(q, 900) end)
              || E'\n\nLab report ' || b.code || ': ' || b.test_name || ' (' || (select name from public.organisations where id = b.org_id) || ')'
              || coalesce(E'\n' || summary, E'\nThe lab''s own file is attached on KashRoot.'), 2000);
  insert into public.advisory_requests (farmer_id, farmer_name, farmer_phone, district, kind, crop, message, lang, status, lab_booking_id)
  values (b.farmer_id, b.farmer_name, b.farmer_phone, b.district, 'question', b.crop, msg, 'en', 'open', b.id) returning id into rid;
  return rid;
end $$;
revoke all on function public.kr_lab_ask_expert(uuid, text) from public, anon;
grant execute on function public.kr_lab_ask_expert(uuid, text) to authenticated;

-- Oversight: every lab booking (no phone numbers, no addresses), for the Super Admin and team members ticked for Businesses.
create or replace function public.kr_lab_oversight() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.kr_is_super_admin() or public.kr_team_can('businesses')) then
    raise exception 'Only the Super Admin and team members with Businesses ticked can see this.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'labs', (select count(*) from public.organisations where kind = 'soil_lab'),
    'bookings', (select coalesce(jsonb_agg(jsonb_build_object(
        'code', b.code, 'lab', o.name, 'test_name', b.test_name, 'farmer', b.farmer_name, 'district', b.district, 'status', b.status, 'price', b.price,
        'created_at', b.created_at, 'scheduled_for', b.scheduled_for, 'has_report', exists (select 1 from public.lab_reports r where r.booking_id = b.id)
      ) order by b.created_at desc), '[]'::jsonb)
      from (select * from public.lab_bookings order by created_at desc limit 300) b join public.organisations o on o.id = b.org_id));
end $$;
revoke all on function public.kr_lab_oversight() from public, anon;
grant execute on function public.kr_lab_oversight() to authenticated;

notify pgrst, 'reload schema';
