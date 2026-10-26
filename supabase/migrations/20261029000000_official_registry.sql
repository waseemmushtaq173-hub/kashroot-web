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
