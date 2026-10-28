-- KashRoot: phone numbers only for signed-in people.
-- Sellers', cold-store owners' and managers', Mandi Helpers' and the cold-store
-- directory's phone numbers could be read by anyone, signed in or not — and so
-- collected by scrapers. Now a signed-out visitor (the anon role) can read
-- every column of these tables EXCEPT the phone columns; a signed-in person
-- reads them as before (row-level security still decides which rows). The
-- website shows "Sign in to call" to signed-out visitors (lib/db/phones).
--   kr_hide_from_anon(table, columns)  gives anon SELECT on every other column
--   of the table. A later migration that adds a column to one of these tables
--   must call it again (or anon cannot read the new column) — this file does
--   it at the end for all four, so re-running RUN_THIS_ONCE.sql keeps it right.
-- Run after 20261106000000_security_hardening.sql. Safe to run again.

create or replace function public.kr_hide_from_anon(p_table text, p_hidden text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  cols text;
begin
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_table and c.column_name <> all (p_hidden);
  if cols is null then raise exception 'No table public.%', p_table; end if;
  execute format('revoke select on public.%I from anon', p_table);
  execute format('grant select (%s) on public.%I to anon', cols, p_table);
end $$;
revoke all on function public.kr_hide_from_anon(text, text[]) from public, anon, authenticated;

select public.kr_hide_from_anon('market_listings', array['phone']);
select public.kr_hide_from_anon('rental_listings', array['phone', 'manager_phone']);
select public.kr_hide_from_anon('mandi_rates', array['phone']);
select public.kr_hide_from_anon('cold_store_directory', array['phone']);

notify pgrst, 'reload schema';
