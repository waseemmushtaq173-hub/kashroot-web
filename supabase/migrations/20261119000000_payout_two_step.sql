-- KashRoot: two-step sign-in before changing where people pay you (payout_accounts).
-- Adding the details the first time stays as before (identity check first, and an email to the
-- account); changing or removing details that are already there now needs two-step sign-in (aal2),
-- like a business's details (20261115000000_business_consoles.sql). Someone with a stolen password
-- cannot send a farmer's or seller's payments to their own account. Removing needs it too, or
-- "remove, then add new" would get round it. Functions that write these rows for KashRoot (as the
-- database owner) are not affected. Run after 20261111000000_admin_mfa.sql. Safe to run again.

drop policy if exists "Two-step before changing payout details" on public.payout_accounts;
create policy "Two-step before changing payout details" on public.payout_accounts as restrictive for update to authenticated
  using (public.kr_aal2()) with check (public.kr_aal2());
drop policy if exists "Two-step before removing payout details" on public.payout_accounts;
create policy "Two-step before removing payout details" on public.payout_accounts as restrictive for delete to authenticated
  using (public.kr_aal2());

notify pgrst, 'reload schema';
