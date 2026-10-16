-- KashRoot: the Kashmiri Lab — native speakers teach the assistant proper Kashmiri.
--   ks_words     Kashmiri words written with every vowel mark, and their meaning.
--                The assistant uses them in every Kashmiri answer, and puts the
--                vowel marks back on any of these words it wrote without them.
--   ks_examples  Questions with the answer as a native speaker would say it.
--                The assistant follows them for similar questions.
--   ks_reports   "Not proper Kashmiri" reports from the assistant, waiting for
--                an editor to correct them.
--   ks_phrases   KashRoot's built-in Kashmiri sentences, as corrected by editors.
-- Editors: admins, and native speakers an admin adds (role KASHMIRI). Work by
-- editors who are not admins counts as contributions (kind 'kashmiri').
-- Run after 20261018000000_accounts_last_active.sql. Safe to run again.

-- ───────────────────────── editors ─────────────────────────
alter table public.staff_roles drop constraint if exists staff_roles_role_check;
alter table public.staff_roles add constraint staff_roles_role_check check (role in ('ADMIN', 'EXPERT', 'DEALER', 'REPORTER', 'KASHMIRI'));

create or replace function public.kr_ks_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.kr_has_role('ADMIN') or public.kr_has_role('KASHMIRI')
$$;
revoke execute on function public.kr_ks_editor() from public, anon;
grant execute on function public.kr_ks_editor() to authenticated;

-- Admin → Kashmiri: who the editors are.
create or replace function public.kr_ks_editors()
returns table (user_id uuid, email text, full_name text, granted_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  return query
    select s.user_id, u.email::text, coalesce(u.raw_user_meta_data ->> 'full_name', '')::text, s.granted_at
    from public.staff_roles s join auth.users u on u.id = s.user_id
    where s.role = 'KASHMIRI'
    order by s.granted_at;
end $$;
revoke execute on function public.kr_ks_editors() from public, anon;
grant execute on function public.kr_ks_editors() to authenticated;

create or replace function public.kr_ks_add_editor(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then raise exception 'No KashRoot account uses that email. Ask them to create an account first (any portal).'; end if;
  insert into public.staff_roles (user_id, role, granted_by) values (uid, 'KASHMIRI', auth.uid()) on conflict do nothing;
end $$;
revoke execute on function public.kr_ks_add_editor(text) from public, anon;
grant execute on function public.kr_ks_add_editor(text) to authenticated;

create or replace function public.kr_ks_remove_editor(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only an admin can do this'; end if;
  delete from public.staff_roles where user_id = p_user and role = 'KASHMIRI';
end $$;
revoke execute on function public.kr_ks_remove_editor(uuid) from public, anon;
grant execute on function public.kr_ks_remove_editor(uuid) to authenticated;

-- ───────────────────────── words ─────────────────────────
create table if not exists public.ks_words (
  id         bigint generated always as identity primary key,
  kashmiri   text not null check (char_length(trim(kashmiri)) between 1 and 80),
  meaning    text not null check (char_length(trim(meaning)) between 1 and 120),
  note       text check (char_length(note) <= 200),
  added_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kashmiri, meaning)
);
alter table public.ks_words enable row level security;
drop trigger if exists ks_words_touch on public.ks_words;
create trigger ks_words_touch before update on public.ks_words for each row execute function public.kr_touch();

-- ───────────────────────── example answers ─────────────────────────
create table if not exists public.ks_examples (
  id         bigint generated always as identity primary key,
  question   text not null check (char_length(trim(question)) between 1 and 600),
  answer     text not null check (char_length(trim(answer)) between 1 and 2000),
  added_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ks_examples enable row level security;
drop trigger if exists ks_examples_touch on public.ks_examples;
create trigger ks_examples_touch before update on public.ks_examples for each row execute function public.kr_touch();

-- ───────────────────────── built-in sentences ─────────────────────────
create table if not exists public.ks_phrases (
  key        text primary key check (key ~ '^[a-z0-9_.]{1,60}$'),
  text       text not null check (char_length(trim(text)) between 1 and 600),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.ks_phrases enable row level security;
drop trigger if exists ks_phrases_touch on public.ks_phrases;
create trigger ks_phrases_touch before update on public.ks_phrases for each row execute function public.kr_touch();

-- Everyone (the KashRoot server, the website) reads words, examples and
-- sentences; only editors write them. Who wrote what is not public.
revoke all on public.ks_words, public.ks_examples, public.ks_phrases from anon, authenticated;
grant select (id, kashmiri, meaning, note, created_at, updated_at) on public.ks_words to anon;
grant select (id, question, answer, created_at, updated_at) on public.ks_examples to anon;
grant select (key, text, updated_at) on public.ks_phrases to anon;
grant select on public.ks_words, public.ks_examples, public.ks_phrases to authenticated;
grant insert (kashmiri, meaning, note), update (kashmiri, meaning, note), delete on public.ks_words to authenticated;
grant insert (question, answer), update (question, answer), delete on public.ks_examples to authenticated;
grant insert (key, text), update (key, text), delete on public.ks_phrases to authenticated;

drop policy if exists ks_words_read on public.ks_words;
create policy ks_words_read on public.ks_words for select to anon, authenticated using (true);
drop policy if exists ks_words_add on public.ks_words;
create policy ks_words_add on public.ks_words for insert to authenticated with check (public.kr_ks_editor() and added_by = auth.uid());
drop policy if exists ks_words_edit on public.ks_words;
create policy ks_words_edit on public.ks_words for update to authenticated using (public.kr_ks_editor()) with check (public.kr_ks_editor());
drop policy if exists ks_words_remove on public.ks_words;
create policy ks_words_remove on public.ks_words for delete to authenticated using (public.kr_has_role('ADMIN') or (public.kr_ks_editor() and added_by = auth.uid()));

drop policy if exists ks_examples_read on public.ks_examples;
create policy ks_examples_read on public.ks_examples for select to anon, authenticated using (true);
drop policy if exists ks_examples_add on public.ks_examples;
create policy ks_examples_add on public.ks_examples for insert to authenticated with check (public.kr_ks_editor() and added_by = auth.uid());
drop policy if exists ks_examples_edit on public.ks_examples;
create policy ks_examples_edit on public.ks_examples for update to authenticated using (public.kr_ks_editor()) with check (public.kr_ks_editor());
drop policy if exists ks_examples_remove on public.ks_examples;
create policy ks_examples_remove on public.ks_examples for delete to authenticated using (public.kr_has_role('ADMIN') or (public.kr_ks_editor() and added_by = auth.uid()));

drop policy if exists ks_phrases_read on public.ks_phrases;
create policy ks_phrases_read on public.ks_phrases for select to anon, authenticated using (true);
drop policy if exists ks_phrases_add on public.ks_phrases;
create policy ks_phrases_add on public.ks_phrases for insert to authenticated with check (public.kr_ks_editor());
drop policy if exists ks_phrases_edit on public.ks_phrases;
create policy ks_phrases_edit on public.ks_phrases for update to authenticated using (public.kr_ks_editor()) with check (public.kr_ks_editor());
drop policy if exists ks_phrases_remove on public.ks_phrases;
create policy ks_phrases_remove on public.ks_phrases for delete to authenticated using (public.kr_ks_editor());

-- ───────────────────────── reports ─────────────────────────
create table if not exists public.ks_reports (
  id          bigint generated always as identity primary key,
  question    text not null default '' check (char_length(question) <= 600),
  reply       text not null check (char_length(trim(reply)) between 1 and 2000),
  suggestion  text check (char_length(suggestion) <= 2000),
  note        text check (char_length(note) <= 300),
  reported_by uuid references auth.users (id) on delete set null,
  status      text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  closed_by   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create index if not exists ks_reports_open on public.ks_reports (status, created_at desc);
alter table public.ks_reports enable row level security;
revoke all on public.ks_reports from anon, authenticated;
grant select, update (status) on public.ks_reports to authenticated;
drop policy if exists ks_reports_editors on public.ks_reports;
create policy ks_reports_editors on public.ks_reports for select to authenticated using (public.kr_ks_editor());
drop policy if exists ks_reports_close on public.ks_reports;
create policy ks_reports_close on public.ks_reports for update to authenticated using (public.kr_ks_editor()) with check (public.kr_ks_editor());

create or replace function public.kr_ks_report_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    new.closed_by := case when new.status = 'open' then null else auth.uid() end;
    new.closed_at := case when new.status = 'open' then null else now() end;
  end if;
  return new;
end $$;
drop trigger if exists ks_reports_closed on public.ks_reports;
create trigger ks_reports_closed before update on public.ks_reports for each row execute function public.kr_ks_report_closed();

-- Anyone using the assistant — signed in or not — can say an answer was not
-- proper Kashmiri. Capped, so a flood of reports cannot fill the database.
create or replace function public.kr_ks_report(p_question text, p_reply text, p_suggestion text default null, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_reply), '') = '' then raise exception 'Nothing to report'; end if;
  if (select count(*) from public.ks_reports where status = 'open') >= 1000 then
    raise exception 'Thank you — many reports are waiting already. Please try again in a few days.';
  end if;
  insert into public.ks_reports (question, reply, suggestion, note, reported_by)
  values (left(coalesce(p_question, ''), 600), left(trim(p_reply), 2000), nullif(left(trim(coalesce(p_suggestion, '')), 2000), ''),
          nullif(left(trim(coalesce(p_note, '')), 300), ''), auth.uid());
end $$;
revoke execute on function public.kr_ks_report(text, text, text, text) from public;
grant execute on function public.kr_ks_report(text, text, text, text) to anon, authenticated;

-- ───────────────────────── contributions ─────────────────────────
alter table public.contributions drop constraint if exists contributions_kind_check;
alter table public.contributions add constraint contributions_kind_check check (kind in ('mandi_rate', 'answer', 'soil_test', 'video_call', 'kashmiri'));
alter table public.pay_rates drop constraint if exists pay_rates_kind_check;
alter table public.pay_rates add constraint pay_rates_kind_check check (kind in ('mandi_rate', 'answer', 'soil_test', 'video_call', 'kashmiri'));
insert into public.pay_rates (kind) values ('kashmiri') on conflict do nothing;

-- A word or an example answer from an editor who is not an admin is one contribution.
create or replace function public.kr_ks_contribution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.added_by is null or exists (select 1 from public.staff_roles where user_id = new.added_by and role = 'ADMIN') then return new; end if;
  if tg_table_name = 'ks_words' then
    insert into public.contributions (user_id, kind, ref_id, title)
    values (new.added_by, 'kashmiri', 'w' || new.id, left('Kashmiri word · ' || new.kashmiri || ' (' || new.meaning || ')', 160))
    on conflict (kind, ref_id, user_id) do nothing;
  else
    insert into public.contributions (user_id, kind, ref_id, title)
    values (new.added_by, 'kashmiri', 'e' || new.id, left('Kashmiri answer · ' || new.question, 160))
    on conflict (kind, ref_id, user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists ks_words_contribution on public.ks_words;
create trigger ks_words_contribution after insert on public.ks_words for each row execute function public.kr_ks_contribution();
drop trigger if exists ks_examples_contribution on public.ks_examples;
create trigger ks_examples_contribution after insert on public.ks_examples for each row execute function public.kr_ks_contribution();
