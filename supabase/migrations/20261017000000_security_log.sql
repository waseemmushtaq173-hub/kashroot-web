-- KashRoot: security log (Admin → Security → Security log).
-- Records, automatically and without anyone being able to edit them:
--   admin code created / changed, wrong admin codes, the portal blocked after
--   wrong codes, Admin portal opened / locked, admin accounts signing in,
--   roles given or taken away, identity-check rules changed, contributors
--   marked paid. Only admins (with the code entered) can read it; nobody can
--   change or delete entries from the website. Kept for one year.
-- Run after 20261016000000_admin_accounts.sql. Safe to run again.

create table if not exists public.security_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid,
  email   text,
  event   text not null,
  detail  text
);
create index if not exists security_log_at on public.security_log (at desc);
alter table public.security_log enable row level security;
revoke all on public.security_log from anon, authenticated;
grant select on public.security_log to authenticated;
drop policy if exists security_log_admins on public.security_log;
create policy security_log_admins on public.security_log for select to authenticated using (public.kr_has_role('ADMIN'));

-- Writes one entry. `who` is the account the event is about (default: the caller).
create or replace function public.kr_log(p_event text, p_detail text default null, p_who uuid default null) returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := coalesce(p_who, auth.uid());
begin
  insert into public.security_log (user_id, email, event, detail)
  values (uid, (select email from auth.users where id = uid), left(p_event, 200), left(p_detail, 500));
  delete from public.security_log where at < now() - interval '1 year';
end $$;
revoke execute on function public.kr_log(text, text, uuid) from public, anon, authenticated;

-- Admin code and wrong codes.
create or replace function public.kr_log_admin_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.kr_log('Admin code created', null, new.user_id);
  else
    if new.code_hash is distinct from old.code_hash then perform public.kr_log('Admin code changed', null, new.user_id); end if;
    if new.failed > old.failed then perform public.kr_log('Wrong admin code', 'attempt ' || new.failed, new.user_id); end if;
    if new.locked_until is distinct from old.locked_until and new.locked_until > now() then
      perform public.kr_log('Admin portal blocked for 15 minutes', 'too many wrong codes', new.user_id);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists kr_log_admin_lock on public.admin_lock;
create trigger kr_log_admin_lock after insert or update on public.admin_lock for each row execute function public.kr_log_admin_lock();

-- Admin portal opened / locked.
create or replace function public.kr_log_admin_unlocks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.kr_log('Admin portal opened', 'with the admin code', new.user_id);
  elsif old.expires_at > now() then
    perform public.kr_log('Admin portal locked', null, old.user_id);
  end if;
  return null;
end $$;
drop trigger if exists kr_log_admin_unlocks on public.admin_unlocks;
create trigger kr_log_admin_unlocks after insert or update or delete on public.admin_unlocks for each row execute function public.kr_log_admin_unlocks();

-- Roles given and taken away (admins, agronomists, dealers, Mandi Helpers).
create or replace function public.kr_log_staff_roles() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if tg_op = 'INSERT' then
    perform public.kr_log('Role given: ' || new.role, 'to ' || coalesce((select email from auth.users where id = new.user_id), new.user_id::text), coalesce(auth.uid(), new.user_id));
  else
    perform public.kr_log('Role removed: ' || old.role, 'from ' || coalesce((select email from auth.users where id = old.user_id), old.user_id::text), coalesce(auth.uid(), old.user_id));
  end if;
  return null;
end $$;
drop trigger if exists kr_log_staff_roles on public.staff_roles;
create trigger kr_log_staff_roles after insert or delete on public.staff_roles for each row execute function public.kr_log_staff_roles();

-- Identity-check (KYC) rules. The secret itself is never written to the log.
create or replace function public.kr_log_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kyc_required is distinct from old.kyc_required or new.pan_required is distinct from old.pan_required then
    perform public.kr_log('Identity-check rules changed', 'Aadhaar required: ' || new.kyc_required || ', PAN required: ' || new.pan_required);
  end if;
  if new.kyc_secret is distinct from old.kyc_secret then perform public.kr_log('KYC server secret changed'); end if;
  return null;
end $$;
drop trigger if exists kr_log_settings on public.kr_settings;
create trigger kr_log_settings after update on public.kr_settings for each row execute function public.kr_log_settings();

-- Contributors marked paid (one entry per payment).
create or replace function public.kr_log_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; total numeric;
begin
  select count(*), coalesce(sum(nr.paid_amount), 0) into n, total
    from new_rows nr join old_rows o on o.id = nr.id
   where o.paid_at is null and nr.paid_at is not null;
  if n > 0 then perform public.kr_log('Contributors marked paid', n || ' item(s), ₹' || total); end if;
  return null;
end $$;
drop trigger if exists kr_log_paid on public.contributions;
create trigger kr_log_paid after update on public.contributions referencing new table as new_rows old table as old_rows
  for each statement execute function public.kr_log_paid();

-- Admin accounts signing in (so a stolen admin password is noticed).
-- Supabase allows triggers on auth.users; if this project does not, it is skipped.
create or replace function public.kr_log_admin_sign_in() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at
     and exists (select 1 from public.staff_roles where user_id = new.id and role = 'ADMIN') then
    perform public.kr_log('Admin account signed in', null, new.id);
  end if;
  return null;
end $$;
do $$
begin
  drop trigger if exists kr_log_admin_sign_in on auth.users;
  create trigger kr_log_admin_sign_in after update of last_sign_in_at on auth.users for each row execute function public.kr_log_admin_sign_in();
exception when others then
  raise notice 'Admin sign-in logging skipped: %', sqlerrm;
end $$;
