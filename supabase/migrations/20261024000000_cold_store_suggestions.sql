-- KashRoot: farmers, owners and helpers can suggest a cold store that is
-- missing from the directory (e.g. a CA store in Lassipora the official list
-- does not have). A suggestion waits ("pending") until the KashRoot admin
-- checks it; only then does everyone see it. The person who suggested it
-- sees their own suggestion while it waits.
-- Run after 20261023000000_cold_store_directory.sql. Safe to run again.

alter table public.cold_store_directory add column if not exists status text not null default 'approved';
alter table public.cold_store_directory drop constraint if exists cold_store_directory_status_check;
alter table public.cold_store_directory add constraint cold_store_directory_status_check check (status in ('approved', 'pending'));
create index if not exists cold_store_directory_pending on public.cold_store_directory (created_at) where status = 'pending';

-- Everyone reads checked entries; the admin and the person who suggested an entry also see it while it waits.
drop policy if exists cold_store_directory_read on public.cold_store_directory;
create policy cold_store_directory_read on public.cold_store_directory for select to anon, authenticated
  using (status = 'approved' or added_by = auth.uid() or public.kr_has_role('ADMIN'));

-- Anyone signed in may suggest one (it waits for the admin).
drop policy if exists cold_store_directory_suggest on public.cold_store_directory;
create policy cold_store_directory_suggest on public.cold_store_directory for insert to authenticated
  with check (status = 'pending' and added_by = auth.uid());

-- Suggestions: a plain source line, and at most 20 a day per person.
create or replace function public.kr_cold_suggestion_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and not public.kr_has_role('ADMIN') then
    if (select count(*) from public.cold_store_directory
         where added_by = auth.uid() and status = 'pending' and created_at > now() - interval '1 day') >= 20 then
      raise exception 'Thank you — that is enough suggestions for today. Please send more tomorrow.';
    end if;
    new.source := 'Suggested by a KashRoot user';
    new.source_url := null;
    new.lat := null;
    new.lon := null;
  end if;
  return new;
end $$;
drop trigger if exists cold_store_directory_suggestion on public.cold_store_directory;
create trigger cold_store_directory_suggestion before insert on public.cold_store_directory for each row execute function public.kr_cold_suggestion_before();
