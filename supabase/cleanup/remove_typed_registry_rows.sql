-- KashRoot: take the typed rows out of the official-list tables.
--
-- NOT a migration: run it by hand, once, in Supabase -> SQL Editor, and read the answers first.
--   Step 1 shows exactly what would go (nothing is changed).
--   Step 2 deletes it, inside a transaction. It ends with ROLLBACK: run it once to see the counts, then
--   change the last line to COMMIT and run it again to really delete.
--
-- Why: the daily job /api/cron/sync-gov-registry (now switched off) copied KashRoot's own typed catalogue into
-- gov_cibrc_products, gov_cibrc_banned and gov_fco_standards and stamped each row "CIB&RC Registered Pesticides
-- (ppqs.gov.in)" or the FCO schedule. A typed row with an official source reads as the Government's word, which it is
-- not (for example one manufacturer typed for a molecule that many companies are registered for). A row loaded from a
-- publisher's own file by the Super Admin's official-feed import always carries who imported it (imported_by), so only
-- rows with no importer are matched: nothing imported from an official file is touched.

-- ───────── Step 1: what would be removed ─────────
select 'gov_cibrc_products' as what, count(*) as rows from public.gov_cibrc_products where imported_by is null
union all
select 'gov_cibrc_banned', count(*) from public.gov_cibrc_banned where imported_by is null
union all
select 'gov_fco_standards', count(*) from public.gov_fco_standards where imported_by is null;

-- ───────── Step 2: remove them (ends in ROLLBACK until you change it) ─────────
begin;
delete from public.gov_cibrc_products where imported_by is null;
delete from public.gov_cibrc_banned where imported_by is null;
delete from public.gov_fco_standards where imported_by is null;
select 'left in gov_cibrc_products' as what, count(*) as rows from public.gov_cibrc_products
union all
select 'left in gov_cibrc_banned', count(*) from public.gov_cibrc_banned
union all
select 'left in gov_fco_standards', count(*) from public.gov_fco_standards;
rollback;
