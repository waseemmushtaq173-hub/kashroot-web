-- Buyer shop: the "Verified seller" badge for farmers too.
--
-- Until now only dealers and admins counted as verified, so a farmer who had
-- finished the identity check (Aadhaar) never showed the badge in the Buyer
-- portal's shop or on Price Comparison, and "Verified sellers only" hid every
-- farmer. A seller now counts as verified when KashRoot has checked their
-- Aadhaar, or when they are a dealer (or admin).
--
-- It returns only ids, never Aadhaar details. The Aadhaar part answers only
-- for people who have a product on sale, so it cannot be used to ask about
-- any account.
--
-- Safe to run again: create or replace, and grants that can be repeated.

create or replace function public.kr_verified_sellers(p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.staff_roles
   where user_id = any(p_ids) and role in ('DEALER', 'ADMIN')
  union
  select k.user_id from public.identity_checks k
   where k.user_id = any(p_ids)
     and k.aadhaar_verified_at is not null
     and exists (select 1 from public.market_listings l where l.seller_id = k.user_id and l.active)
$$;

revoke all on function public.kr_verified_sellers(uuid[]) from public;
grant execute on function public.kr_verified_sellers(uuid[]) to anon, authenticated;
