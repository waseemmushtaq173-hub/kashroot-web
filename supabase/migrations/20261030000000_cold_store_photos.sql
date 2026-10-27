-- KashRoot: real photos of a cold store, added by its owner, so a farmer sees
-- the store as it is beside the drawing, the 3D view and the walk inside.
--   rental_listings.photos  up to 8 photos: [{src, note}], src a JPEG / PNG /
--                           WebP data URL made smaller on the phone (at most
--                           about 450 KB each), note a few words ("Main door",
--                           "Chamber 2, bins") of at most 80 letters.
-- Read only when a farmer opens the store (never with the list of stores).
-- The owner changes them like the rest of the store ("Owners edit listings");
-- anyone who can see the store sees them ("Anyone browses active listings").
-- Run after 20261029000000_official_registry.sql. Safe to run again.

alter table public.rental_listings add column if not exists photos jsonb;

create or replace function public.kr_store_photos_ok(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select p is null or (
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) <= 8
    and not exists (
      select 1 from jsonb_array_elements(p) x
      where jsonb_typeof(x) <> 'object'
         or jsonb_typeof(x -> 'src') is distinct from 'string'
         or (x ->> 'src') !~ '^data:image/(jpeg|png|webp);base64,'
         or char_length(x ->> 'src') > 460000
         or (x ? 'note' and jsonb_typeof(x -> 'note') not in ('string', 'null'))
         or char_length(coalesce(x ->> 'note', '')) > 80
    )
  )
$$;

alter table public.rental_listings drop constraint if exists rental_listings_photos_check;
alter table public.rental_listings add constraint rental_listings_photos_check check (public.kr_store_photos_ok(photos));

notify pgrst, 'reload schema';
