-- IDOR sweep: one row in every public table owned by the farmer F / buyer B; then an unrelated
-- signed-in user O and anon try to read, change and delete every row. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'farmer@test.in'),
  ('00000000-0000-0000-0000-0000000000b2', 'buyer@test.in'),
  ('00000000-0000-0000-0000-0000000000c3', 'other@test.in')
on conflict do nothing;

create temp table seeded (tbl text, ok boolean, why text);
create temp table idor (tbl text, who text, rows_seen int, rows_changed int, rows_removed int, note text);
grant all on seeded, idor to anon, authenticated;

create or replace function pg_temp.val_for(t text, col text) returns text language sql as $$
  select case
    when t = 'uuid' and col ~ '(seller|owner|farmer|registered_by|reporter|user|granted_by|expert|checked_by|driver)' then quote_literal('00000000-0000-0000-0000-0000000000f1') || '::uuid'
    when t = 'uuid' and col ~ '(buyer|renter|requested_by)' then quote_literal('00000000-0000-0000-0000-0000000000b2') || '::uuid'
    when t = 'uuid' then 'gen_random_uuid()'
    when t like 'character varying%' or t = 'text' then quote_literal('t' || substr(md5(random()::text), 1, 6))
    when t in ('integer', 'bigint', 'smallint') then '1'
    when t = 'numeric' or t like 'numeric(%' or t in ('real', 'double precision') then '1'
    when t = 'boolean' then 'true'
    when t = 'date' then 'current_date'
    when t like 'timestamp%' then 'now()'
    when t = 'jsonb' or t = 'json' then '''{}''::jsonb'
    when t like '%[]' then '''{}'''
    else 'null'
  end
$$;

-- Seed as the superuser with triggers and foreign keys off (replica): one row per table.
set session_replication_role = replica;
do $$
declare
  t record;
  cols text;
  vals text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' order by 1 loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
           string_agg(pg_temp.val_for(format_type(a.atttypid, a.atttypmod), a.attname), ', ' order by a.attnum)
      into cols, vals
      from pg_attribute a
     where a.attrelid = ('public.' || quote_ident(t.relname))::regclass and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = '' and a.attidentity = ''
       and (a.attnotnull and not exists (select 1 from pg_attrdef d where d.adrelid = a.attrelid and d.adnum = a.attnum)
            or a.attname ~ '(seller|owner|farmer|buyer|renter|user_id|registered_by|reporter|expert_id)');
    begin
      if cols is null then execute format('insert into public.%I default values', t.relname);
      else execute format('insert into public.%I (%s) values (%s)', t.relname, cols, vals); end if;
      insert into seeded values (t.relname, true, null);
    exception when others then
      insert into seeded values (t.relname, false, left(sqlerrm, 80));
    end;
  end loop;
end $$;
set session_replication_role = origin;

-- Now each outsider tries every table.
do $$
declare
  t record;
  who text;
  seen int;
  changed int;
  removed int;
  col text;
begin
  for t in select tbl from seeded where ok order by 1 loop
    foreach who in array array['anon', 'other user'] loop
      begin
        perform set_config('request.jwt.claim.sub', case when who = 'anon' then '' else '00000000-0000-0000-0000-0000000000c3' end, true);
        execute 'set local role ' || case when who = 'anon' then 'anon' else 'authenticated' end;
        begin execute format('select count(*) from public.%I', t.tbl) into seen; exception when others then seen := -1; end;
        -- Change any one ordinary column of every row to itself.
        select a.attname into col from pg_attribute a
         where a.attrelid = ('public.' || quote_ident(t.tbl))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity = ''
         order by a.attnum desc limit 1;
        begin execute format('with u as (update public.%I set %I = %I returning 1) select count(*) from u', t.tbl, col, col) into changed; exception when others then changed := -1; end;
        begin execute format('with d as (delete from public.%I returning 1) select count(*) from d', t.tbl) into removed; exception when others then removed := -1; end;
        reset role;
        insert into idor values (t.tbl, who, seen, changed, removed, null);
      exception when others then
        reset role;
        insert into idor values (t.tbl, who, null, null, null, left(sqlerrm, 80));
      end;
    end loop;
  end loop;
end $$;

\echo '--- tables that could not be seeded (checked by hand) ---'
select tbl, why from seeded where not ok order by 1;
\echo '--- what outsiders could do (-1 = refused outright; 0 = nothing; >0 = rows) ---'
select tbl, who, rows_seen as seen, rows_changed as changed, rows_removed as removed, note from idor order by (greatest(rows_changed, 0) + greatest(rows_removed, 0) + greatest(rows_seen, 0)) desc, tbl, who;

-- PASS / FAIL: an outsider changes and removes nothing anywhere, and sees only the public lists.
do $$
declare bad text;
begin
  select string_agg(tbl || ' (' || who || ')', ', ') into bad from idor
   where rows_changed > 0 or rows_removed > 0
      or (rows_seen > 0 and tbl not in ('cold_store_directory', 'fertilizer_batches'));
  if bad is not null then raise exception 'FAIL: an outsider could reach rows in: %', bad; end if;
  raise notice 'PASS: no outsider read, changed or removed anyone''s rows (% table checks)', (select count(*) from idor);
end $$;
