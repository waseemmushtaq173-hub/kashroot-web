-- KashRoot: Help & Support for every customer — also for someone who cannot
-- sign in (app/support, app/api/support).
--   support_requests  one request: who (name, phone to call back, the account
--                     when signed in), the topic (sign-in, payment, order…),
--                     their words, and its status (open → answered → closed).
--                     Its code (e.g. H-3F9A2C1B) is what they quote on the phone.
--   support_messages  the conversation: the customer's notes and KashRoot's replies.
-- Opening a request, checking one by code + phone, and adding a note go only
-- through the KashRoot server (KYC_DB_SECRET in Vercel), which limits how
-- often; a signed-in person reads their own requests; admins read all and
-- reply (kr_support_reply). Nobody writes the tables directly.
-- Run after 20261104000000_admin_code_bcrypt.sql. Safe to run again.

create table if not exists public.support_requests (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  user_id    uuid references auth.users (id) on delete set null,
  name       text not null check (char_length(name) between 1 and 80),
  phone      text not null check (phone ~ '^[6-9][0-9]{9}$'),
  email      text check (email is null or char_length(email) <= 120),
  topic      text not null check (topic in ('login', 'payment', 'order', 'cold_storage', 'selling', 'other')),
  portal     text check (portal is null or char_length(portal) <= 30),
  lang       text not null default 'en' check (lang in ('en', 'hi', 'ur', 'ks')),
  message    text not null check (char_length(message) between 5 and 2000),
  status     text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_requests_status on public.support_requests (status, updated_at desc);
create index if not exists support_requests_user on public.support_requests (user_id);

create table if not exists public.support_messages (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.support_requests (id) on delete cascade,
  author      text not null check (author in ('customer', 'kashroot')),
  author_name text check (author_name is null or char_length(author_name) <= 80),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists support_messages_request on public.support_messages (request_id, created_at);

alter table public.support_requests enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_requests from anon, authenticated;
revoke all on public.support_messages from anon, authenticated;
grant select on public.support_requests to authenticated;
grant select on public.support_messages to authenticated;

drop policy if exists "Own requests, admins see all" on public.support_requests;
create policy "Own requests, admins see all" on public.support_requests for select to authenticated
  using (user_id = auth.uid() or public.kr_has_role('ADMIN'));
drop policy if exists "Messages of own requests, admins see all" on public.support_messages;
create policy "Messages of own requests, admins see all" on public.support_messages for select to authenticated
  using (public.kr_has_role('ADMIN') or exists (select 1 from public.support_requests r where r.id = request_id and r.user_id = auth.uid()));

-- Open a request (the KashRoot server only). The account is the caller's when signed in. Returns its code.
create or replace function public.kr_support_open(p_secret text, p_name text, p_phone text, p_email text, p_topic text, p_portal text, p_lang text, p_message text) returns text
language plpgsql security definer set search_path = public as $$
declare
  s text;
  c text;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  loop
    c := 'H-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.support_requests where code = c);
  end loop;
  insert into public.support_requests (code, user_id, name, phone, email, topic, portal, lang, message)
  values (c, auth.uid(), btrim(p_name), p_phone, nullif(btrim(coalesce(p_email, '')), ''), p_topic, nullif(btrim(coalesce(p_portal, '')), ''),
          coalesce(nullif(p_lang, ''), 'en'), btrim(p_message));
  return c;
end $$;
revoke all on function public.kr_support_open(text, text, text, text, text, text, text, text) from public;
grant execute on function public.kr_support_open(text, text, text, text, text, text, text, text) to anon, authenticated;

-- A request by its code and the phone it was opened with (the KashRoot server only): status and the conversation.
create or replace function public.kr_support_status(p_secret text, p_code text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s text;
  r public.support_requests;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.support_requests where code = upper(btrim(p_code)) and phone = p_phone;
  if not found then return null; end if;
  return jsonb_build_object(
    'code', r.code, 'topic', r.topic, 'status', r.status, 'created_at', r.created_at, 'message', r.message,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('author', m.author, 'author_name', m.author_name, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
                          from public.support_messages m where m.request_id = r.id), '[]'::jsonb));
end $$;
revoke all on function public.kr_support_status(text, text, text) from public;
grant execute on function public.kr_support_status(text, text, text) to anon, authenticated;

-- The customer adds a note (the KashRoot server only): the request opens again.
create or replace function public.kr_support_add(p_secret text, p_code text, p_phone text, p_body text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
  rid uuid;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  select id into rid from public.support_requests where code = upper(btrim(p_code)) and phone = p_phone;
  if rid is null then return false; end if;
  insert into public.support_messages (request_id, author, body) values (rid, 'customer', btrim(p_body));
  update public.support_requests set status = 'open', updated_at = now() where id = rid;
  return true;
end $$;
revoke all on function public.kr_support_add(text, text, text, text) from public;
grant execute on function public.kr_support_add(text, text, text, text) to anon, authenticated;

-- KashRoot replies (admins only); `p_close` closes the request, else it is answered.
create or replace function public.kr_support_reply(p_id uuid, p_body text, p_close boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only KashRoot admins can reply.' using errcode = '42501'; end if;
  if not exists (select 1 from public.support_requests where id = p_id) then return false; end if;
  if char_length(btrim(coalesce(p_body, ''))) > 0 then
    insert into public.support_messages (request_id, author, author_name, body) values (p_id, 'kashroot', 'KashRoot support', btrim(p_body));
  end if;
  update public.support_requests set status = case when p_close then 'closed' else 'answered' end, updated_at = now() where id = p_id;
  return true;
end $$;
revoke all on function public.kr_support_reply(uuid, text, boolean) from public;
grant execute on function public.kr_support_reply(uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';
