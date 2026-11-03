-- Used by run.sh between two loads of RUN_THIS_ONCE.sql (not a test file of its own): fills the tables
-- whose CHECK lists grow over time with one row of EVERY value the database allows right now — read
-- from the constraints themselves, so a new kind is covered without editing this file. Running
-- RUN_THIS_ONCE.sql again afterwards proves no older migration replays a shorter list (ERROR 23514).
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'every-kind@test.in') on conflict do nothing;

do $$
declare
  allowed text[];
  v text;
  rid uuid;
  -- The values a "col in ('a', 'b', …)" check allows, as Postgres stores it.
  vals text;
begin
  -- security_events.kind
  select pg_get_constraintdef(c.oid) into vals from pg_constraint c where c.conname = 'security_events_kind_check';
  allowed := array(select m[1] from regexp_matches(vals, '''([a-z_]+)''', 'g') as m);
  foreach v in array allowed loop
    insert into public.security_events (kind, detail) values (v, 'every kind');
  end loop;

  -- email_outbox.kind
  select pg_get_constraintdef(c.oid) into vals from pg_constraint c where c.conname = 'email_outbox_kind_check';
  allowed := array(select m[1] from regexp_matches(vals, '''([a-z_]+)''', 'g') as m);
  foreach v in array allowed loop
    insert into public.email_outbox (kind, user_id, ref) values (v, '00000000-0000-0000-0000-0000000000e1', 'H-EVERY');
  end loop;

  -- support_requests.status and support_messages.author
  select pg_get_constraintdef(c.oid) into vals from pg_constraint c where c.conname = 'support_requests_status_check';
  allowed := array(select m[1] from regexp_matches(vals, '''([a-z_]+)''', 'g') as m);
  foreach v in array allowed loop
    insert into public.support_requests (code, name, phone, topic, message, status)
    values ('H-' || upper(substr(md5(v), 1, 8)), 'Every kind', '9876543210', 'other', 'every status', v)
    returning id into rid;
  end loop;
  select pg_get_constraintdef(c.oid) into vals from pg_constraint c where c.conname = 'support_messages_author_check';
  allowed := array(select m[1] from regexp_matches(vals, '''([a-z_]+)''', 'g') as m);
  foreach v in array allowed loop
    insert into public.support_messages (request_id, author, body) values (rid, v, 'every author');
  end loop;

  raise notice 'seeded every allowed kind / status / author';
end $$;
