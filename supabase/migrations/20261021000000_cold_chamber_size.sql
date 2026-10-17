-- KashRoot: cold store chambers drawn from their real size.
--   cold_chambers.size  what the owner measured — length (door to back wall),
--                       breadth and height in metres, the unit they use, and
--                       their store's standards (box size, stack base,
--                       walkway, air gaps). The app works out the rows, stacks
--                       and boxes per place from it; rows / cols /
--                       boxes_per_slot keep what booking uses.
-- Run after 20261020000000_cold_store_map.sql. Safe to run again.

alter table public.cold_chambers add column if not exists size jsonb;
alter table public.cold_chambers drop constraint if exists cold_chambers_size_check;
alter table public.cold_chambers add constraint cold_chambers_size_check
  check (size is null or (jsonb_typeof(size) = 'object' and pg_column_size(size) < 4000));
