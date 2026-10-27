-- KashRoot assistant: its own answer bank, written or approved by KashRoot's
-- experts. The assistant answers from here first (fast, free, and it works
-- when the AI is down); the AI answers only questions the bank cannot.
--   assistant_answers      an answer in one language (en, hi, ur, ks) with the
--                          ways people ask it, and the expert who wrote or
--                          approved it ("Answer from KashRoot expert …")
--   assistant_suggestions  questions the AI answered, waiting for an expert:
--                          edit and approve into the bank, or discard. No
--                          account is kept with them, and long digit runs
--                          (phone or Aadhaar numbers) are removed first.
-- Experts (staff role EXPERT) and admins manage both in Advisory → Answer
-- bank. Everyone else reaches the bank only through kr_answer_match, which
-- gives the one best approved answer for a question.
-- Run after 20261101000000_source_cache.sql. Safe to run again.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.kr_is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.kr_has_role('EXPERT') or public.kr_has_role('ADMIN')
$$;
revoke all on function public.kr_is_editor() from public, anon;
grant execute on function public.kr_is_editor() to authenticated;

-- The same question written another way still matches: lower case, no punctuation, single spaces.
create or replace function public.kr_question_norm(p text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^[:alnum:][:space:]]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create table if not exists public.assistant_answers (
  id          uuid primary key default gen_random_uuid(),
  lang        text not null check (lang in ('en', 'hi', 'ur', 'ks')),
  questions   text[] not null check (cardinality(questions) between 1 and 20),
  answer      text not null check (char_length(answer) between 2 and 2000),
  topic       text check (char_length(topic) <= 60),
  origin      text not null default 'expert' check (origin in ('expert', 'ai_reviewed')),
  author_id   uuid references auth.users (id) on delete set null,
  author_name text check (char_length(author_name) <= 80),
  status      text not null default 'approved' check (status in ('approved', 'hidden')),
  uses        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.assistant_answers enable row level security;
revoke all on public.assistant_answers from anon;
grant select, insert, update, delete on public.assistant_answers to authenticated;

drop policy if exists "Experts read the answer bank" on public.assistant_answers;
create policy "Experts read the answer bank" on public.assistant_answers for select to authenticated using (public.kr_is_editor());
drop policy if exists "Experts add answers" on public.assistant_answers;
create policy "Experts add answers" on public.assistant_answers for insert to authenticated with check (public.kr_is_editor());
drop policy if exists "Experts change answers" on public.assistant_answers;
create policy "Experts change answers" on public.assistant_answers for update to authenticated using (public.kr_is_editor()) with check (public.kr_is_editor());
drop policy if exists "Experts remove answers" on public.assistant_answers;
create policy "Experts remove answers" on public.assistant_answers for delete to authenticated using (public.kr_is_editor());

-- Who wrote it is the database's word, never the browser's; each phrasing is kept short and tidy.
create or replace function public.kr_answer_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  q text[];
begin
  -- kr_answer_match counting a use: nothing else changes, and it is not an edit.
  if tg_op = 'UPDATE' and new.uses = old.uses + 1
     and (new.answer, new.questions, new.status, new.lang, coalesce(new.topic, '')) is not distinct from (old.answer, old.questions, old.status, old.lang, coalesce(old.topic, '')) then
    new.updated_at := old.updated_at;
    return new;
  end if;
  select coalesce(array_agg(x), '{}') into q
    from (select distinct left(btrim(t), 300) as x from unnest(new.questions) t where btrim(coalesce(t, '')) <> '') s;
  if cardinality(q) = 0 then raise exception 'Write at least one way people ask this question.'; end if;
  new.questions := q;
  new.answer := btrim(new.answer);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := left(coalesce(
      (select nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '') from auth.users u where u.id = auth.uid()),
      'KashRoot expert'), 80);
    new.uses := 0;
    new.created_at := now();
  else
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
    new.uses := old.uses;
  end if;
  return new;
end $$;
drop trigger if exists kr_answer_before on public.assistant_answers;
create trigger kr_answer_before before insert or update on public.assistant_answers for each row execute function public.kr_answer_before();

create table if not exists public.assistant_suggestions (
  id         bigserial primary key,
  lang       text not null check (lang in ('en', 'hi', 'ur', 'ks')),
  question   text not null check (char_length(question) between 2 and 600),
  reply      text not null check (char_length(reply) between 1 and 4000),
  asked      integer not null default 1,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'discarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_suggestions_pending on public.assistant_suggestions (status, updated_at desc);
alter table public.assistant_suggestions enable row level security;
revoke all on public.assistant_suggestions from anon;
grant select, update on public.assistant_suggestions to authenticated;
drop policy if exists "Experts read suggestions" on public.assistant_suggestions;
create policy "Experts read suggestions" on public.assistant_suggestions for select to authenticated using (public.kr_is_editor());
drop policy if exists "Experts close suggestions" on public.assistant_suggestions;
create policy "Experts close suggestions" on public.assistant_suggestions for update to authenticated using (public.kr_is_editor()) with check (public.kr_is_editor());

-- The KashRoot server (KYC_DB_SECRET) adds a question the AI answered. The same
-- question asked again counts up instead of adding a row. At most 2,000 wait.
create or replace function public.kr_suggest_answer(p_secret text, p_lang text, p_question text, p_reply text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
  q text := btrim(regexp_replace(left(coalesce(p_question, ''), 600), '\d{7,}', '…', 'g'));
  r text := btrim(regexp_replace(left(coalesce(p_reply, ''), 4000), '\d{10,}', '…', 'g'));
  n text;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then return false; end if;
  if p_lang not in ('en', 'hi', 'ur', 'ks') or char_length(q) < 2 or char_length(r) < 1 then return false; end if;
  n := public.kr_question_norm(q);
  update public.assistant_suggestions
     set asked = asked + 1, reply = r, updated_at = now()
   where status = 'pending' and lang = p_lang and public.kr_question_norm(question) = n;
  if not found then
    insert into public.assistant_suggestions (lang, question, reply) values (p_lang, q, r);
    delete from public.assistant_suggestions where id in (
      select id from public.assistant_suggestions where status = 'pending' order by updated_at desc offset 2000
    );
  end if;
  return true;
end $$;
revoke all on function public.kr_suggest_answer(text, text, text, text) from public;
grant execute on function public.kr_suggest_answer(text, text, text, text) to anon, authenticated;

-- The assistant: the best approved answer for a question, in this language
-- or else in English (to be translated), when it is close enough. Counts a use.
create or replace function public.kr_answer_match(p_query text, p_lang text)
returns table (id uuid, lang text, answer text, author_name text, origin text, score real)
language plpgsql security definer set search_path = public, extensions as $$
declare
  q text := public.kr_question_norm(left(p_query, 600));
  best record;
begin
  if char_length(q) < 3 then return; end if;
  select s.* into best
    from (
      select a.id, a.lang, a.answer, a.author_name, a.origin,
             (select max(extensions.similarity(public.kr_question_norm(x), q)) from unnest(a.questions) x)::real as score
        from public.assistant_answers a
       where a.status = 'approved' and a.lang in (p_lang, 'en')
    ) s
   where s.score >= 0.6
   order by (s.lang = p_lang) desc, s.score desc
   limit 1;
  if best.id is null then return; end if;
  update public.assistant_answers a set uses = a.uses + 1 where a.id = best.id;
  id := best.id; lang := best.lang; answer := best.answer; author_name := best.author_name; origin := best.origin; score := best.score;
  return next;
end $$;
revoke all on function public.kr_answer_match(text, text) from public;
grant execute on function public.kr_answer_match(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
