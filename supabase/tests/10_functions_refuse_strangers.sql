-- Call every API-callable definer function as anon and as a signed-in user with no roles, with
-- made-up arguments, and record whether it refused (an error) or answered. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'nobody@test.in') on conflict do nothing;
create temp table sweep (fn text, who text, outcome text, detail text);
grant all on sweep to anon, authenticated;

create or replace function pg_temp.arg_for(t text) returns text language sql as $$
  select case
    when t = 'uuid' then quote_literal(gen_random_uuid()::text) || '::uuid'
    when t = 'uuid[]' then 'array[' || quote_literal(gen_random_uuid()::text) || '::uuid]'
    when t = 'text[]' then 'array[''1A:1'']::text[]'
    when t in ('text') then '''x'''
    when t = 'boolean' then 'true'
    when t in ('integer', 'bigint', 'smallint') then '1'
    when t in ('numeric', 'real', 'double precision') then '1'
    when t = 'date' then 'current_date'
    when t like 'timestamp%' then 'now()'
    when t = 'jsonb' then '''[]''::jsonb'
    else 'null'
  end
$$;

do $$
declare
  f record;
  call text;
  who text;
  res text;
begin
  for f in
    select p.oid, p.proname,
           (select string_agg(pg_temp.arg_for(format_type(t, null)), ', ' order by o) from unnest(p.proargtypes) with ordinality a(t, o)) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('anon', p.oid, 'execute')
     order by 2
  loop
    foreach who in array array['anon', 'signed-in'] loop
      call := format('select (public.%I(%s))::text', f.proname, coalesce(f.args, ''));
      begin
        if who = 'anon' then
          perform set_config('role', 'anon', true);
          perform set_config('request.jwt.claim.sub', '', true);
        else
          perform set_config('role', 'authenticated', true);
          perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
        end if;
        execute 'set local role ' || case when who = 'anon' then 'anon' else 'authenticated' end;
        execute call into res;
        reset role;
        insert into sweep values (f.proname, who, 'ANSWERED', left(coalesce(res, 'null'), 90));
      exception when others then
        reset role;
        insert into sweep values (f.proname, who, 'refused', left(sqlerrm, 90));
      end;
    end loop;
  end loop;
end $$;

\echo '--- answered (needs a look) ---'
select fn, who, detail from sweep where outcome = 'ANSWERED' order by fn, who;
\echo '--- refused ---'
select fn, who, detail from sweep where outcome = 'refused' order by fn, who;

-- PASS / FAIL: only these may answer a stranger (public lookups, a status flag, or functions that
-- answer "no" / nothing for someone else's id). Anything else answering is a failure.
do $$
declare bad text;
begin
  select string_agg(distinct fn, ', ') into bad from sweep
   where outcome = 'ANSWERED' and fn not in (
     'kr_admin_lock_now', 'kr_admin_status', 'kr_admin_unlocked', 'kr_answer_match', 'kr_cache_get', 'kr_cache_put',
     'kr_can_see_request', 'kr_check_batch', 'kr_cold_free_now', 'kr_cold_map', 'kr_driver_view', 'kr_has_role',
     'kr_is_admin_account', 'kr_kyc_ok', 'kr_kyc_rules', 'kr_order_driver_view', 'kr_payment_details', 'kr_rate_hit',
     'kr_registry_search', 'kr_registry_stats', 'kr_suggest_answer', 'kr_track', 'kr_verified_sellers');
  if bad is not null then raise exception 'FAIL: these functions answered a stranger: %', bad; end if;
  raise notice 'PASS: every other function refused anon and a signed-in stranger';
end $$;
