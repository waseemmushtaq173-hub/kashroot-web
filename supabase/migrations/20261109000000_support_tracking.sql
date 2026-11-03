-- KashRoot: following a help request from start to end (app/support, Admin → Help desk).
--   Status: Received (open) → Being looked at (in_progress) → Answered → Resolved (closed).
--   Staff can set the status, reply, and add internal notes the customer never sees
--   (support_messages.author = 'internal').
--   The customer finds a request by its code and the mobile number OR the email
--   they gave, and can say "This solved my problem" (Resolved) or "Still need
--   help" (back to Received) — by code + contact through the server, or as
--   the signed-in owner.
--   Emails (20261108000000_email_outbox.sql): the person now also gets "We got
--   your request" (help_ack) and "Your request is resolved" (help_resolved, not
--   when they marked it solved themselves); the reply email now carries the
--   reply's words. Internal notes never email anyone.
-- Run after 20261108000000_email_outbox.sql. Safe to run again.

-- ── Statuses and internal notes ──
alter table public.support_requests drop constraint if exists support_requests_status_check;
alter table public.support_requests add constraint support_requests_status_check check (status in ('open', 'in_progress', 'answered', 'closed'));
alter table public.support_messages drop constraint if exists support_messages_author_check;
alter table public.support_messages add constraint support_messages_author_check check (author in ('customer', 'kashroot', 'internal'));

-- The customer reads their own requests' messages, never internal notes; admins read all.
drop policy if exists "Messages of own requests, admins see all" on public.support_messages;
create policy "Messages of own requests, admins see all" on public.support_messages for select to authenticated
  using (public.kr_has_role('ADMIN') or (author <> 'internal' and exists (select 1 from public.support_requests r where r.id = request_id and r.user_id = auth.uid())));

/** A request by its code and the mobile number or email it was given with; null when they do not match. */
create or replace function public.kr_support_find(p_code text, p_contact text) returns public.support_requests
language sql stable security definer set search_path = public as $$
  select * from public.support_requests
  where code = upper(btrim(p_code))
    and (phone = btrim(coalesce(p_contact, '')) or (email is not null and lower(email) = lower(btrim(coalesce(p_contact, '')))))
  limit 1
$$;
revoke all on function public.kr_support_find(text, text) from public, anon, authenticated;

-- Status and the conversation (the KashRoot server only), by code + mobile or email. No internal notes.
create or replace function public.kr_support_status(p_secret text, p_code text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s text;
  r public.support_requests;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  r := public.kr_support_find(p_code, p_phone);
  if r.id is null then return null; end if;
  return jsonb_build_object(
    'code', r.code, 'topic', r.topic, 'status', r.status, 'created_at', r.created_at, 'updated_at', r.updated_at, 'message', r.message,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('author', m.author, 'author_name', m.author_name, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
                          from public.support_messages m where m.request_id = r.id and m.author <> 'internal'), '[]'::jsonb));
end $$;
revoke all on function public.kr_support_status(text, text, text) from public;
grant execute on function public.kr_support_status(text, text, text) to anon, authenticated;

-- The customer adds a note (the KashRoot server only), by code + mobile or email: the request opens again.
create or replace function public.kr_support_add(p_secret text, p_code text, p_phone text, p_body text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
  r public.support_requests;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  r := public.kr_support_find(p_code, p_phone);
  if r.id is null then return false; end if;
  insert into public.support_messages (request_id, author, body) values (r.id, 'customer', btrim(p_body));
  update public.support_requests set status = 'open', updated_at = now() where id = r.id;
  return true;
end $$;
revoke all on function public.kr_support_add(text, text, text, text) from public;
grant execute on function public.kr_support_add(text, text, text, text) to anon, authenticated;

-- "This solved my problem" (Resolved) or "Still need help" (Received again), as a note in the conversation.
create or replace function public.kr_support_settle(p_id uuid, p_solved boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Marked by the customer: no "resolved" email back to them.
  perform set_config('kr.support_by_customer', '1', true);
  insert into public.support_messages (request_id, author, body)
  values (p_id, 'customer', case when p_solved then 'This solved my problem.' else 'I still need help.' end);
  update public.support_requests set status = case when p_solved then 'closed' else 'open' end, updated_at = now() where id = p_id;
  perform set_config('kr.support_by_customer', '', true);
end $$;
revoke all on function public.kr_support_settle(uuid, boolean) from public, anon, authenticated;

-- … by code + mobile or email (the KashRoot server only).
create or replace function public.kr_support_feedback(p_secret text, p_code text, p_contact text, p_solved boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s text;
  r public.support_requests;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  r := public.kr_support_find(p_code, p_contact);
  if r.id is null then return false; end if;
  perform public.kr_support_settle(r.id, coalesce(p_solved, false));
  return true;
end $$;
revoke all on function public.kr_support_feedback(text, text, text, boolean) from public;
grant execute on function public.kr_support_feedback(text, text, text, boolean) to anon, authenticated;

-- … by the signed-in owner of the request.
create or replace function public.kr_support_feedback_mine(p_code text, p_solved boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select id into rid from public.support_requests where code = upper(btrim(p_code)) and user_id = auth.uid();
  if rid is null then return false; end if;
  perform public.kr_support_settle(rid, coalesce(p_solved, false));
  return true;
end $$;
revoke all on function public.kr_support_feedback_mine(text, boolean) from public, anon;
grant execute on function public.kr_support_feedback_mine(text, boolean) to authenticated;

-- Staff: set the status (admins only).
create or replace function public.kr_support_set_status(p_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only KashRoot admins can do this.' using errcode = '42501'; end if;
  if p_status not in ('open', 'in_progress', 'answered', 'closed') then raise exception 'Unknown status.'; end if;
  update public.support_requests set status = p_status, updated_at = now() where id = p_id;
  return found;
end $$;
revoke all on function public.kr_support_set_status(uuid, text) from public, anon;
grant execute on function public.kr_support_set_status(uuid, text) to authenticated;

-- Staff: an internal note (admins only) — never shown to the customer, never emailed.
create or replace function public.kr_support_note(p_id uuid, p_body text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.kr_has_role('ADMIN') then raise exception 'Only KashRoot admins can do this.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then return false; end if;
  if not exists (select 1 from public.support_requests where id = p_id) then return false; end if;
  insert into public.support_messages (request_id, author, author_name, body) values (p_id, 'internal', 'KashRoot staff', btrim(p_body));
  return true;
end $$;
revoke all on function public.kr_support_note(uuid, text) from public, anon;
grant execute on function public.kr_support_note(uuid, text) to authenticated;

-- ── Emails ──
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
-- The one complete list (the same in every migration that sets it, newest: 20261110000000_signin_lockout.sql),
-- so RUN_THIS_ONCE.sql can be run again on a database that already holds every kind.
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'help_new', 'help_ack', 'help_reply', 'help_resolved', 'payout_changed', 'password_changed', 'email_changed', 'phone_changed', 'new_signin', 'signin_locked'));

-- A new request: to the support inbox, and "We got your request" to the person when they gave an email.
create or replace function public.kr_email_on_help() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_outbox (kind, ref) values ('help_new', new.code);
  if new.email is not null then insert into public.email_outbox (kind, to_email, ref) values ('help_ack', new.email, new.code); end if;
  return new;
end $$;

-- Resolved by KashRoot: "Your request is resolved" to the person (not when they marked it solved themselves).
create or replace function public.kr_email_on_resolved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' and old.status <> 'closed' and new.email is not null and coalesce(current_setting('kr.support_by_customer', true), '') <> '1' then
    insert into public.email_outbox (kind, to_email, ref) values ('help_resolved', new.email, new.code);
  end if;
  return new;
end $$;
drop trigger if exists support_requests_resolved_email on public.support_requests;
create trigger support_requests_resolved_email after update of status on public.support_requests for each row execute function public.kr_email_on_resolved();

-- The emails now also carry: a reply's words (help_reply), and the request's topic (help_ack, help_resolved).
create or replace function public.kr_email_claim(p_secret text, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s text;
  allowance integer;
  out jsonb;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  if random() < 0.05 then delete from public.email_outbox where status in ('sent', 'failed') and created_at < now() - interval '30 days'; end if;
  allowance := greatest(0, 450 - (select count(*) from public.email_outbox where status = 'sent' and sent_at > now() - interval '24 hours')::integer);
  with due as (
    select o.id from public.email_outbox o
    where o.status = 'pending' and o.next_try_at <= now()
    order by o.id
    limit least(greatest(coalesce(p_limit, 0), 0), 20, allowance)
    for update skip locked
  ), held as (
    update public.email_outbox o set attempts = o.attempts + 1, next_try_at = now() + interval '10 minutes'
    from due where o.id = due.id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'kind', h.kind, 'ref', h.ref, 'detail', h.detail, 'attempts', h.attempts, 'created_at', h.created_at,
    'to', case when h.kind = 'help_new' then null when h.user_id is not null then u.email else h.to_email end,
    'help', case when h.kind in ('help_new', 'help_ack', 'help_resolved', 'help_reply') then (
      select jsonb_build_object('name', r.name, 'phone', r.phone, 'email', r.email, 'topic', r.topic, 'portal', r.portal, 'lang', r.lang, 'message', r.message, 'signed_in', r.user_id is not null)
      from public.support_requests r where r.code = h.ref) end,
    'reply', case when h.kind = 'help_reply' then (
      select m.body from public.support_messages m join public.support_requests r on r.id = m.request_id
      where r.code = h.ref and m.author = 'kashroot' order by m.created_at desc limit 1) end
  ) order by h.id), '[]'::jsonb)
  into out
  from held h left join auth.users u on u.id = h.user_id;
  return out;
end $$;
revoke all on function public.kr_email_claim(text, integer) from public;
grant execute on function public.kr_email_claim(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
