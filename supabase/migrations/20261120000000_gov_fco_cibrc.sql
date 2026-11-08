-- KashRoot TrueScan: official Government of India statutory registries.
--
--   gov_fco_standards    Fertiliser (Control) Order, 1985 — Schedule I
--                        statutory nutrient specs (min/max % by weight) for
--                        every fertiliser grade the FCO specifies.
--   gov_cibrc_products   CIB&RC (ppqs.gov.in) registered agro-chemicals under
--                        the Insecticides Act, 1968: CIR registration numbers,
--                        active molecules, formulations, approved crops,
--                        target pests/diseases, dosage, waiting periods,
--                        toxicity class.
--   gov_cibrc_banned     Ministry of Agriculture list of Banned and
--                        Restricted pesticides in India.
--
-- Nothing here is typed in by KashRoot: every row is loaded from the official
-- Government gazette / ppqs.gov.in / data.gov.in publication, always with its
-- source and publication date. Everyone reads; only an admin imports.
--
-- Run after 20261029000000_official_registry.sql. Safe to run again.

-- ── Fertiliser (Control) Order, 1985 — Schedule I statutory standards ──────

create table if not exists public.gov_fco_standards (
  id              uuid primary key default gen_random_uuid(),
  fco_schedule_clause text not null check (char_length(trim(fco_schedule_clause)) between 2 and 100),
  fertiliser_type   text not null check (char_length(trim(fertiliser_type)) between 2 and 200),
  grade             text not null check (char_length(trim(grade)) between 1 and 50),
  total_n_min       numeric(5, 2),          -- total nitrogen %, minimum
  ws_p2o5_min       numeric(5, 2),          -- water-soluble phosphate %, minimum
  cs_p2o5_min       numeric(5, 2),          -- citrate-soluble phosphate %, minimum
  ws_k2o_min        numeric(5, 2),          -- water-soluble potash %, minimum
  micronutrient_min numeric(5, 2),          -- micronutrient %, minimum (when specified)
  moisture_max      numeric(5, 2),          -- moisture %, maximum
  biuret_max        numeric(5, 2),          -- biuret %, maximum (urea)
  chlorides_max     numeric(5, 2),          -- chlorides %, maximum
  free_acidity_max  numeric(5, 2),          -- free acidity %, maximum
  ph_range          text check (char_length(ph_range) <= 20),
  particle_size_spec text check (char_length(particle_size_spec) <= 200),
  source            text not null check (char_length(trim(source)) between 2 and 200),
  source_url        text not null check (source_url ~ '^https?://' and char_length(source_url) <= 500),
  published_at      timestamptz not null,
  imported_at       timestamptz not null default now(),
  imported_by       uuid default auth.uid() references auth.users (id) on delete set null,
  check (total_n_min is null or total_n_min >= 0),
  check (ws_p2o5_min is null or ws_p2o5_min >= 0),
  check (cs_p2o5_min is null or cs_p2o5_min >= 0),
  check (ws_k2o_min is null or ws_k2o_min >= 0),
  check (micronutrient_min is null or micronutrient_min >= 0),
  check (moisture_max is null or moisture_max >= 0),
  check (biuret_max is null or biuret_max >= 0),
  check (chlorides_max is null or chlorides_max >= 0),
  check (free_acidity_max is null or free_acidity_max >= 0)
);

alter table public.gov_fco_standards enable row level security;
revoke all on public.gov_fco_standards from anon, authenticated;
grant select (id, fco_schedule_clause, fertiliser_type, grade, total_n_min, ws_p2o5_min, cs_p2o5_min, ws_k2o_min, micronutrient_min, moisture_max, biuret_max, chlorides_max, free_acidity_max, ph_range, particle_size_spec, source, source_url, published_at, imported_at) on public.gov_fco_standards to anon, authenticated;
grant insert, update, delete on public.gov_fco_standards to authenticated;

drop policy if exists gov_fco_standards_read on public.gov_fco_standards;
create policy gov_fco_standards_read on public.gov_fco_standards for select to anon, authenticated using (true);
drop policy if exists gov_fco_standards_admin on public.gov_fco_standards;
create policy gov_fco_standards_admin on public.gov_fco_standards for all to authenticated
  using (public.kr_has_role('ADMIN')) with check (public.kr_has_role('ADMIN'));

create unique index if not exists gov_fco_standards_one
  on public.gov_fco_standards (fertiliser_type, grade, fco_schedule_clause);
create index if not exists gov_fco_standards_type on public.gov_fco_standards (fertiliser_type);
create index if not exists gov_fco_standards_grade on public.gov_fco_standards (grade);

-- ── CIB&RC registered products (Insecticides Act, 1968) ────────────────────

create table if not exists public.gov_cibrc_products (
  id              uuid primary key default gen_random_uuid(),
  cir_no          text not null check (char_length(trim(cir_no)) between 1 and 100),
  active_molecule text not null check (char_length(trim(active_molecule)) between 2 and 200),
  formulation     text check (char_length(formulation) <= 50),           -- EC, WP, SC, WG, SL, etc.
  section         text check (char_length(section) <= 20),               -- 9(3), 9(4)
  approved_crops  text[] not null default '{}'::text[],                  -- e.g. {Apple, Mango, Rice}
  target_pests    text[] not null default '{}'::text[],                  -- e.g. {Apple Scab, San Jose Scale}
  dosage_per_ha   text check (char_length(dosage_per_ha) <= 100),
  dosage_per_acre text check (char_length(dosage_per_acre) <= 100),
  waiting_period_days integer check (waiting_period_days >= 0),
  toxicity_class  text check (char_length(toxicity_class) <= 20),        -- Red, Yellow, Blue, Green
  manufacturer    text check (char_length(manufacturer) <= 200),
  source          text not null check (char_length(trim(source)) between 2 and 200),
  source_url      text not null check (source_url ~ '^https?://' and char_length(source_url) <= 500),
  published_at    timestamptz not null,
  imported_at     timestamptz not null default now(),
  imported_by     uuid default auth.uid() references auth.users (id) on delete set null
);

alter table public.gov_cibrc_products enable row level security;
revoke all on public.gov_cibrc_products from anon, authenticated;
grant select (id, cir_no, active_molecule, formulation, section, approved_crops, target_pests, dosage_per_ha, dosage_per_acre, waiting_period_days, toxicity_class, manufacturer, source, source_url, published_at, imported_at) on public.gov_cibrc_products to anon, authenticated;
grant insert, update, delete on public.gov_cibrc_products to authenticated;

drop policy if exists gov_cibrc_products_read on public.gov_cibrc_products;
create policy gov_cibrc_products_read on public.gov_cibrc_products for select to anon, authenticated using (true);
drop policy if exists gov_cibrc_products_admin on public.gov_cibrc_products;
create policy gov_cibrc_products_admin on public.gov_cibrc_products for all to authenticated
  using (public.kr_has_role('ADMIN')) with check (public.kr_has_role('ADMIN'));

create unique index if not exists gov_cibrc_products_one on public.gov_cibrc_products (cir_no, formulation);
create index if not exists gov_cibrc_products_molecule on public.gov_cibrc_products (active_molecule);
create index if not exists gov_cibrc_products_crops on public.gov_cibrc_products using gin (approved_crops);
create index if not exists gov_cibrc_products_pests on public.gov_cibrc_products using gin (target_pests);

-- ── CIB&RC banned & restricted pesticides (Ministry of Agriculture) ────────

create table if not exists public.gov_cibrc_banned (
  id              uuid primary key default gen_random_uuid(),
  active_molecule text not null check (char_length(trim(active_molecule)) between 2 and 200),
  common_name     text check (char_length(common_name) <= 200),
  status          text not null check (status in ('banned', 'restricted', 'withdrawn')),
  ban_notification text check (char_length(ban_notification) <= 200),     -- Gazette notification no.
  ban_date        date,
  crops_affected  text[] not null default '{}'::text[],
  reason_summary  text check (char_length(reason_summary) <= 500),
  source          text not null check (char_length(trim(source)) between 2 and 200),
  source_url      text not null check (source_url ~ '^https?://' and char_length(source_url) <= 500),
  published_at    timestamptz not null,
  imported_at     timestamptz not null default now(),
  imported_by     uuid default auth.uid() references auth.users (id) on delete set null
);

alter table public.gov_cibrc_banned enable row level security;
revoke all on public.gov_cibrc_banned from anon, authenticated;
grant select (id, active_molecule, common_name, status, ban_notification, ban_date, crops_affected, reason_summary, source, source_url, published_at, imported_at) on public.gov_cibrc_banned to anon, authenticated;
grant insert, update, delete on public.gov_cibrc_banned to authenticated;

drop policy if exists gov_cibrc_banned_read on public.gov_cibrc_banned;
create policy gov_cibrc_banned_read on public.gov_cibrc_banned for select to anon, authenticated using (true);
drop policy if exists gov_cibrc_banned_admin on public.gov_cibrc_banned;
create policy gov_cibrc_banned_admin on public.gov_cibrc_banned for all to authenticated
  using (public.kr_has_role('ADMIN')) with check (public.kr_has_role('ADMIN'));

create unique index if not exists gov_cibrc_banned_one on public.gov_cibrc_banned (active_molecule, status);
create index if not exists gov_cibrc_banned_molecule on public.gov_cibrc_banned (active_molecule);
create index if not exists gov_cibrc_banned_status on public.gov_cibrc_banned (status);

-- ── Admin: import FCO standards ────────────────────────────────────────────

create or replace function public.kr_fco_import(p_rows jsonb, p_source text, p_source_url text)
returns integer
language plpgsql security definer set search_path = public as $$
declare added integer;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can import FCO standards'; end if;
  if char_length(trim(coalesce(p_source, ''))) not between 2 and 200 then raise exception 'Write the name of the source'; end if;
  if coalesce(p_source_url, '') !~ '^https?://' or char_length(p_source_url) > 500 then raise exception 'Add the link to the source'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import'; end if;
  with rows as (
    select left(regexp_replace(trim(r ->> 'fco_schedule_clause'), '\s+', ' ', 'g'), 100) as fco_schedule_clause,
           left(regexp_replace(trim(r ->> 'fertiliser_type'), '\s+', ' ', 'g'), 200) as fertiliser_type,
           left(regexp_replace(trim(r ->> 'grade'), '\s+', ' ', 'g'), 50) as grade,
           nullif(r ->> 'total_n_min', '')::numeric(5,2) as total_n_min,
           nullif(r ->> 'ws_p2o5_min', '')::numeric(5,2) as ws_p2o5_min,
           nullif(r ->> 'cs_p2o5_min', '')::numeric(5,2) as cs_p2o5_min,
           nullif(r ->> 'ws_k2o_min', '')::numeric(5,2) as ws_k2o_min,
           nullif(r ->> 'micronutrient_min', '')::numeric(5,2) as micronutrient_min,
           nullif(r ->> 'moisture_max', '')::numeric(5,2) as moisture_max,
           nullif(r ->> 'biuret_max', '')::numeric(5,2) as biuret_max,
           nullif(r ->> 'chlorides_max', '')::numeric(5,2) as chlorides_max,
           nullif(r ->> 'free_acidity_max', '')::numeric(5,2) as free_acidity_max,
           nullif(trim(r ->> 'ph_range'), '') as ph_range,
           nullif(trim(r ->> 'particle_size_spec'), '') as particle_size_spec
      from jsonb_array_elements(p_rows) r
     where jsonb_typeof(r) = 'object'
       and char_length(trim(coalesce(r ->> 'fertiliser_type', ''))) between 2 and 200
       and char_length(trim(coalesce(r ->> 'grade', ''))) between 1 and 50
  ), ins as (
    insert into public.gov_fco_standards (fco_schedule_clause, fertiliser_type, grade, total_n_min, ws_p2o5_min, cs_p2o5_min, ws_k2o_min, micronutrient_min, moisture_max, biuret_max, chlorides_max, free_acidity_max, ph_range, particle_size_spec, source, source_url, published_at, imported_by)
    select fco_schedule_clause, fertiliser_type, grade, total_n_min, ws_p2o5_min, cs_p2o5_min, ws_k2o_min, micronutrient_min, moisture_max, biuret_max, chlorides_max, free_acidity_max, ph_range, particle_size_spec, trim(p_source), p_source_url, now(), auth.uid()
      from rows
    on conflict (fertiliser_type, grade, fco_schedule_clause)
      do update set total_n_min = excluded.total_n_min, ws_p2o5_min = excluded.ws_p2o5_min, cs_p2o5_min = excluded.cs_p2o5_min, ws_k2o_min = excluded.ws_k2o_min, micronutrient_min = excluded.micronutrient_min, moisture_max = excluded.moisture_max, biuret_max = excluded.biuret_max, chlorides_max = excluded.chlorides_max, free_acidity_max = excluded.free_acidity_max, ph_range = excluded.ph_range, particle_size_spec = excluded.particle_size_spec, source = excluded.source, source_url = excluded.source_url, published_at = excluded.published_at, imported_at = now()
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new) into added from ins;
  return added;
end $$;
revoke execute on function public.kr_fco_import(jsonb, text, text) from public, anon;
grant execute on function public.kr_fco_import(jsonb, text, text) to authenticated;

-- ── Admin: import CIBRC products ───────────────────────────────────────────

create or replace function public.kr_cibrc_import(p_rows jsonb, p_source text, p_source_url text)
returns integer
language plpgsql security definer set search_path = public as $$
declare added integer;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can import CIBRC products'; end if;
  if char_length(trim(coalesce(p_source, ''))) not between 2 and 200 then raise exception 'Write the name of the source'; end if;
  if coalesce(p_source_url, '') !~ '^https?://' or char_length(p_source_url) > 500 then raise exception 'Add the link to the source'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import'; end if;
  with rows as (
    select left(regexp_replace(trim(r ->> 'cir_no'), '\s+', ' ', 'g'), 100) as cir_no,
           left(regexp_replace(trim(r ->> 'active_molecule'), '\s+', ' ', 'g'), 200) as active_molecule,
           nullif(trim(r ->> 'formulation'), '') as formulation,
           nullif(trim(r ->> 'section'), '') as section,
           (r -> 'approved_crops')::text[] as approved_crops,
           (r -> 'target_pests')::text[] as target_pests,
           nullif(trim(r ->> 'dosage_per_ha'), '') as dosage_per_ha,
           nullif(trim(r ->> 'dosage_per_acre'), '') as dosage_per_acre,
           nullif(r ->> 'waiting_period_days', '')::integer as waiting_period_days,
           nullif(trim(r ->> 'toxicity_class'), '') as toxicity_class,
           nullif(trim(r ->> 'manufacturer'), '') as manufacturer
      from jsonb_array_elements(p_rows) r
     where jsonb_typeof(r) = 'object'
       and char_length(trim(coalesce(r ->> 'cir_no', ''))) between 1 and 100
       and char_length(trim(coalesce(r ->> 'active_molecule', ''))) between 2 and 200
  ), ins as (
    insert into public.gov_cibrc_products (cir_no, active_molecule, formulation, section, approved_crops, target_pests, dosage_per_ha, dosage_per_acre, waiting_period_days, toxicity_class, manufacturer, source, source_url, published_at, imported_by)
    select cir_no, active_molecule, formulation, section, coalesce(approved_crops, '{}'::text[]), coalesce(target_pests, '{}'::text[]), dosage_per_ha, dosage_per_acre, waiting_period_days, toxicity_class, manufacturer, trim(p_source), p_source_url, now(), auth.uid()
      from rows
    on conflict (cir_no, formulation)
      do update set active_molecule = excluded.active_molecule, section = excluded.section, approved_crops = excluded.approved_crops, target_pests = excluded.target_pests, dosage_per_ha = excluded.dosage_per_ha, dosage_per_acre = excluded.dosage_per_acre, waiting_period_days = excluded.waiting_period_days, toxicity_class = excluded.toxicity_class, manufacturer = excluded.manufacturer, source = excluded.source, source_url = excluded.source_url, published_at = excluded.published_at, imported_at = now()
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new) into added from ins;
  return added;
end $$;
revoke execute on function public.kr_cibrc_import(jsonb, text, text) from public, anon;
grant execute on function public.kr_cibrc_import(jsonb, text, text) to authenticated;

-- ── Admin: import CIBRC banned/restricted ─────────────────────────────────

create or replace function public.kr_cibrc_banned_import(p_rows jsonb, p_source text, p_source_url text)
returns integer
language plpgsql security definer set search_path = public as $$
declare added integer;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can import CIBRC banned list'; end if;
  if char_length(trim(coalesce(p_source, ''))) not between 2 and 200 then raise exception 'Write the name of the source'; end if;
  if coalesce(p_source_url, '') !~ '^https?://' or char_length(p_source_url) > 500 then raise exception 'Add the link to the source'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nothing to import'; end if;
  with rows as (
    select left(regexp_replace(trim(r ->> 'active_molecule'), '\s+', ' ', 'g'), 200) as active_molecule,
           nullif(trim(r ->> 'common_name'), '') as common_name,
           lower(nullif(trim(r ->> 'status'), '')) as status,
           nullif(trim(r ->> 'ban_notification'), '') as ban_notification,
           nullif(r ->> 'ban_date', '')::date as ban_date,
           (r -> 'crops_affected')::text[] as crops_affected,
           nullif(trim(r ->> 'reason_summary'), '') as reason_summary
      from jsonb_array_elements(p_rows) r
     where jsonb_typeof(r) = 'object'
       and char_length(trim(coalesce(r ->> 'active_molecule', ''))) between 2 and 200
       and lower(trim(coalesce(r ->> 'status', ''))) in ('banned', 'restricted', 'withdrawn')
  ), ins as (
    insert into public.gov_cibrc_banned (active_molecule, common_name, status, ban_notification, ban_date, crops_affected, reason_summary, source, source_url, published_at, imported_by)
    select active_molecule, common_name, status, ban_notification, ban_date, coalesce(crops_affected, '{}'::text[]), reason_summary, trim(p_source), p_source_url, now(), auth.uid()
      from rows
    on conflict (active_molecule, status)
      do update set common_name = excluded.common_name, ban_notification = excluded.ban_notification, ban_date = excluded.ban_date, crops_affected = excluded.crops_affected, reason_summary = excluded.reason_summary, source = excluded.source, source_url = excluded.source_url, published_at = excluded.published_at, imported_at = now()
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new) into added from ins;
  return added;
end $$;
revoke execute on function public.kr_cibrc_banned_import(jsonb, text, text) from public, anon;
grant execute on function public.kr_cibrc_banned_import(jsonb, text, text) to authenticated;

-- ── Everyone: read lookups ─────────────────────────────────────────────────

-- FCO standard for one fertiliser type + grade (exact match first, then type-only).
create or replace function public.kr_fco_lookup(p_fertiliser_type text, p_grade text default null)
returns table (id uuid, fco_schedule_clause text, fertiliser_type text, grade text, total_n_min numeric, ws_p2o5_min numeric, cs_p2o5_min numeric, ws_k2o_min numeric, micronutrient_min numeric, moisture_max numeric, biuret_max numeric, chlorides_max numeric, free_acidity_max numeric, ph_range text, particle_size_spec text, source text, source_url text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, fco_schedule_clause, fertiliser_type, grade, total_n_min, ws_p2o5_min, cs_p2o5_min, ws_k2o_min, micronutrient_min, moisture_max, biuret_max, chlorides_max, free_acidity_max, ph_range, particle_size_spec, source, source_url, published_at
    from public.gov_fco_standards
   where fertiliser_type = p_fertiliser_type
     and (p_grade is null or grade = p_grade)
   order by (case when p_grade is not null and grade = p_grade then 0 else 1 end), imported_at desc
   limit 1;
$$;
revoke all on function public.kr_fco_lookup(text, text) from public;
grant execute on function public.kr_fco_lookup(text, text) to anon, authenticated;

-- CIBRC product by registration number (exact) or by active molecule + crop.
create or replace function public.kr_cibrc_lookup(p_cir_no text default null, p_active_molecule text default null, p_crop text default null)
returns table (id uuid, cir_no text, active_molecule text, formulation text, section text, approved_crops text[], target_pests text[], dosage_per_ha text, dosage_per_acre text, waiting_period_days integer, toxicity_class text, manufacturer text, source text, source_url text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, cir_no, active_molecule, formulation, section, approved_crops, target_pests, dosage_per_ha, dosage_per_acre, waiting_period_days, toxicity_class, manufacturer, source, source_url, published_at
    from public.gov_cibrc_products
   where (p_cir_no is null or cir_no = p_cir_no)
     and (p_active_molecule is null or active_molecule = p_active_molecule)
     and (p_crop is null or p_crop = any(approved_crops))
   order by imported_at desc
   limit 20;
$$;
revoke all on function public.kr_cibrc_lookup(text, text, text) from public;
grant execute on function public.kr_cibrc_lookup(text, text, text) to anon, authenticated;

-- Is an active molecule banned or restricted?
create or replace function public.kr_cibrc_banned_check(p_active_molecule text)
returns table (id uuid, active_molecule text, common_name text, status text, ban_notification text, ban_date date, crops_affected text[], reason_summary text, source text, source_url text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, active_molecule, common_name, status, ban_notification, ban_date, crops_affected, reason_summary, source, source_url, published_at
    from public.gov_cibrc_banned
   where active_molecule = p_active_molecule
   order by imported_at desc;
$$;
revoke all on function public.kr_cibrc_banned_check(text) from public;
grant execute on function public.kr_cibrc_banned_check(text) to anon, authenticated;
