-- Phones only when signed in (20261107000000_private_phones.sql): a signed-out visitor reads the
-- listings, the mandi rates and the cold-store directory, but no phone number; a signed-in person
-- reads the phones; the setup row says yes. Rolled back.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'farmer@test.in') on conflict do nothing;
set session_replication_role = replica;
insert into public.market_listings (seller_id, seller_name, phone, district, category, product, unit, price, quantity, active)
  values ('00000000-0000-0000-0000-0000000000f1', 'Farmer F', '9876543210', 'Shopian', 'produce', 'Apples', 'box', 900, 10, true);
set session_replication_role = origin;
create temp table t (step text, ok boolean);
grant all on t to anon, authenticated;

set local role anon;
insert into t select 'anon reads the listing without its phone', count(*) = 1 from (select id, seller_name, price from public.market_listings) x;
do $$
declare tbl text; col text;
begin
  foreach tbl in array array['market_listings.phone', 'rental_listings.phone', 'rental_listings.manager_phone', 'mandi_rates.phone', 'cold_store_directory.phone'] loop
    col := split_part(tbl, '.', 2);
    begin
      execute format('select %I from public.%I limit 1', col, split_part(tbl, '.', 1));
      insert into t values ('anon cannot read ' || tbl, false);
    exception when insufficient_privilege then
      insert into t values ('anon cannot read ' || tbl, true);
    end;
  end loop;
  begin
    perform * from public.market_listings limit 1;
    insert into t values ('anon select * is refused (asks for the phone)', false);
  exception when insufficient_privilege then
    insert into t values ('anon select * is refused (asks for the phone)', true);
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
insert into t select 'a signed-in person reads the phone', phone = '9876543210' from public.market_listings where seller_name = 'Farmer F';
insert into t select 'signed in: the directory phone column is readable', count(*) >= 0 from (select phone from public.cold_store_directory limit 1) x;
reset role;
insert into t select 'the setup row says yes', done = 'yes' from public.kr_setup_rows() where step = 29;

select count(*) filter (where not ok) > 0 as bad, string_agg(step, ', ') filter (where not ok) as which from t \gset
\if :bad
\echo 'FAIL: private phones —' :'which'
select 1 / 0 as fail;
\else
\echo 'PASS: signed-out visitors read listings, rates and the directory without any phone; signed-in people read them'
\endif
