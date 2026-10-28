-- Shared rate limits (20261103000000_rate_limits.sql): only the server counts, the limit holds,
-- a new window starts afresh, nobody reads the table. Run inside begin / rollback.
\set ON_ERROR_STOP on
select public.kr_kyc_secret() is not null as made \gset
select kyc_secret as s from public.kr_settings where id = 1 \gset
set local role anon;
select public.kr_rate_hit('wrong', 'k', 2, 60) as wrong_secret \gset
select public.kr_rate_hit(:'s', 'k', 2, 60) as h1 \gset
select public.kr_rate_hit(:'s', 'k', 2, 60) as h2 \gset
select public.kr_rate_hit(:'s', 'k', 2, 60) as h3 \gset
reset role;
update public.rate_buckets set started_at = now() - interval '2 minutes' where key = 'k';
set local role anon;
select public.kr_rate_hit(:'s', 'k', 2, 60) as after_window \gset
reset role;
select (not :'wrong_secret'::boolean and not :'h1'::boolean and not :'h2'::boolean and :'h3'::boolean and not :'after_window'::boolean) as ok \gset
\if :ok
\echo 'PASS: the third request in the window is over the limit, a new window starts afresh, a wrong secret counts nothing'
\else
\echo 'FAIL: rate limits'
select 1 / 0 as fail;
\endif
-- Nobody reads the table (an error here is the pass).
\set ON_ERROR_STOP off
savepoint peek;
set local role anon;
select count(*) as anon_can_read from public.rate_buckets;
rollback to savepoint peek;
