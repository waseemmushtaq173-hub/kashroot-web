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
