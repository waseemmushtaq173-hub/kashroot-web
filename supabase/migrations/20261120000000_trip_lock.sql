-- KashRoot: a driver's trip that cannot be stopped quietly, places picked on the map, and
-- "location lost" alerts (Tracking portal, app/drive/<token>).
--   consignments  + origin_lat/lng, dest_lat/lng: where the load starts and goes, from the place
--                   search (optional; older loads have only the names). Used for the Google Maps
--                   route link and the distance left.
--                 + delivery_code: 6 digits, seen only by the sender (their own row). The sender
--                   gives it to the receiver; the driver types it when the load arrives. That is
--                   the only way the DRIVER can end the trip — there is no "stop sharing".
--                 + delivery_tries: wrong codes typed; after 5 the driver cannot end the trip
--                   any more and the sender marks it delivered.
--                 + consent_at, trip_started_at: the driver agreed to share their location until
--                   delivery, and when the trip started.
--                 + lost_at: during a trip, no position for 5 minutes (GPS off, location blocked,
--                   page closed, no network). Cleared by the next position.
--   consignment_events  what happened on the trip: started, lost, back, the driver's phone saying
--                   GPS is off / location is blocked / the page was closed, wrong codes, delivered,
--                   cancelled. Nobody can change or delete them; the sender reads their own.
--   kr_driver_start(token, consent)   the driver agrees and the trip starts.
--   kr_driver_signal(token, kind)     the driver's page reports a problem (at most once a minute per kind).
--   kr_driver_delivered(token, code)  ends the trip only with the receiver's code. The old
--                   one-argument version (end without a code) is removed.
--   kr_trip_watch(secret)             marks trips lost and queues one email to the sender
--                   ("trip_lost"); the KashRoot server runs it before sending emails
--                   (/api/email/flush). With pg_cron enabled it also runs every 5 minutes.
--   kr_track       also gives the start and destination points and whether the location is lost
--                   (never the delivery code, the driver link or the events).
-- A website cannot force a phone to share its location: the phone's owner can always turn GPS
-- off. This makes it impossible to stop from KashRoot and impossible to hide: the sender is told.
-- Run after 20261119000000_payout_two_step.sql. Safe to run again.

alter table public.consignments add column if not exists origin_lat double precision;
alter table public.consignments add column if not exists origin_lng double precision;
alter table public.consignments add column if not exists dest_lat double precision;
alter table public.consignments add column if not exists dest_lng double precision;
alter table public.consignments add column if not exists delivery_code text;
alter table public.consignments add column if not exists delivery_tries integer not null default 0;
alter table public.consignments add column if not exists consent_at timestamptz;
alter table public.consignments add column if not exists trip_started_at timestamptz;
alter table public.consignments add column if not exists lost_at timestamptz;

alter table public.consignments alter column delivery_code set default lpad((floor(random() * 1000000))::int::text, 6, '0');
update public.consignments set delivery_code = lpad((floor(random() * 1000000))::int::text, 6, '0') where delivery_code is null;

alter table public.consignments drop constraint if exists consignments_points_check;
alter table public.consignments add constraint consignments_points_check check (
  (origin_lat is null or origin_lat between -90 and 90) and (origin_lng is null or origin_lng between -180 and 180)
  and (dest_lat is null or dest_lat between -90 and 90) and (dest_lng is null or dest_lng between -180 and 180));
alter table public.consignments drop constraint if exists consignments_delivery_code_check;
alter table public.consignments add constraint consignments_delivery_code_check check (delivery_code is null or delivery_code ~ '^[0-9]{6}$');

create table if not exists public.consignment_events (
  id     bigint generated always as identity primary key,
  code   text not null references public.consignments (code) on delete cascade,
  kind   text not null check (kind in ('started', 'resumed', 'lost', 'back', 'gps_off', 'location_blocked', 'page_closed',
                                       'code_wrong', 'code_locked', 'delivered', 'cancelled')),
  detail text check (detail is null or char_length(detail) <= 120),
  at     timestamptz not null default now()
);
create index if not exists consignment_events_code on public.consignment_events (code, id desc);
alter table public.consignment_events enable row level security;
revoke all on public.consignment_events from anon, authenticated;
grant select on public.consignment_events to authenticated;
drop policy if exists "Senders read their trip events" on public.consignment_events;
create policy "Senders read their trip events" on public.consignment_events for select to authenticated
  using (exists (select 1 from public.consignments c where c.code = consignment_events.code and c.owner_id = auth.uid()));

-- Every status change (also the sender's own "Mark delivered" / cancel) goes into the events.
create or replace function public.kr_consignment_status_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('delivered', 'cancelled') then
    insert into public.consignment_events (code, kind, detail)
    values (new.code, new.status, case when auth.uid() = new.owner_id then 'by the sender' else 'with the receiver''s code' end);
  end if;
  return new;
end $$;
drop trigger if exists consignments_status_event on public.consignments;
create trigger consignments_status_event after update of status on public.consignments
  for each row execute function public.kr_consignment_status_event();

-- What the driver's page needs (never the delivery code or the sender's account).
create or replace function public.kr_driver_view(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', code, 'origin', origin, 'destination', destination, 'cargo', cargo,
                            'vehicle_no', vehicle_no, 'status', status, 'last_seen', last_seen,
                            'started', trip_started_at is not null, 'consent_at', consent_at,
                            'origin_lat', origin_lat, 'origin_lng', origin_lng, 'dest_lat', dest_lat, 'dest_lng', dest_lng,
                            'code_locked', delivery_tries >= 5)
  from public.consignments where driver_token = p_token
$$;

-- The driver agrees to share their location until delivery, and the trip starts.
create or replace function public.kr_driver_start(p_token text, p_consent boolean) returns text
language plpgsql security definer set search_path = public as $$
declare c public.consignments;
begin
  select * into c from public.consignments where driver_token = p_token for update;
  if not found then raise exception 'This driver link is not valid'; end if;
  if c.status in ('delivered', 'cancelled') then return c.status; end if;
  if p_consent is not true then raise exception 'The driver must agree to share their location for this trip'; end if;
  update public.consignments set consent_at = coalesce(consent_at, now()), trip_started_at = coalesce(trip_started_at, now()),
    status = 'in_transit'
  where code = c.code;
  insert into public.consignment_events (code, kind) values (c.code, case when c.trip_started_at is null then 'started' else 'resumed' end);
  return 'in_transit';
end $$;

-- A position from the driver's phone (as before), and the trip is no longer "lost".
create or replace function public.kr_driver_ping(p_token text, p_lat double precision, p_lng double precision, p_accuracy real default null)
returns text language plpgsql security definer set search_path = public as $$
declare c public.consignments;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Bad location'; end if;
  select * into c from public.consignments where driver_token = p_token for update;
  if not found then raise exception 'This driver link is not valid'; end if;
  if c.status in ('delivered', 'cancelled') then return c.status; end if;
  if c.lost_at is not null then
    update public.consignments set lost_at = null where code = c.code;
    insert into public.consignment_events (code, kind) values (c.code, 'back');
  end if;
  -- At most one stored point every 20 seconds.
  if c.last_seen is not null and c.last_seen > now() - interval '20 seconds' then return c.status; end if;
  update public.consignments set last_lat = p_lat, last_lng = p_lng, last_accuracy = p_accuracy, last_seen = now(),
    trip_started_at = coalesce(trip_started_at, now()),
    status = case when status = 'booked' then 'in_transit' else status end
  where code = c.code;
  insert into public.consignment_points (code, lat, lng) values (c.code, p_lat, p_lng);
  delete from public.consignment_points where code = c.code and id not in (select id from public.consignment_points where code = c.code order by id desc limit 500);
  return 'in_transit';
end $$;

-- The driver's page says something is wrong (GPS off, location blocked, page closed).
create or replace function public.kr_driver_signal(p_token text, p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.consignments;
begin
  select * into c from public.consignments where driver_token = p_token;
  if not found then raise exception 'This driver link is not valid'; end if;
  if p_kind not in ('gps_off', 'location_blocked', 'page_closed') then raise exception 'Unknown signal'; end if;
  if c.status <> 'in_transit' then return false; end if;
  if exists (select 1 from public.consignment_events e where e.code = c.code and e.kind = p_kind and e.at > now() - interval '1 minute') then return false; end if;
  insert into public.consignment_events (code, kind) values (c.code, p_kind);
  return true;
end $$;

-- The load arrived: the driver types the receiver's code. Nothing else ends the trip from the driver's side.
drop function if exists public.kr_driver_delivered(text);
create or replace function public.kr_driver_delivered(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.consignments;
begin
  select * into c from public.consignments where driver_token = p_token for update;
  if not found then raise exception 'This driver link is not valid'; end if;
  if c.status in ('delivered', 'cancelled') then return jsonb_build_object('ok', c.status = 'delivered', 'status', c.status); end if;
  if c.delivery_tries >= 5 then return jsonb_build_object('ok', false, 'locked', true, 'left', 0); end if;
  if c.delivery_code is null or coalesce(regexp_replace(p_code, '\D', '', 'g'), '') <> c.delivery_code then
    update public.consignments set delivery_tries = delivery_tries + 1 where code = c.code;
    insert into public.consignment_events (code, kind) values (c.code, case when c.delivery_tries + 1 >= 5 then 'code_locked' else 'code_wrong' end);
    return jsonb_build_object('ok', false, 'locked', c.delivery_tries + 1 >= 5, 'left', greatest(0, 4 - c.delivery_tries));
  end if;
  update public.consignments set status = 'delivered', lost_at = null where code = c.code;
  return jsonb_build_object('ok', true, 'status', 'delivered');
end $$;

-- Anyone with the code: as before, plus the start / destination points and whether the location is lost.
create or replace function public.kr_track(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when c.code is null then null else jsonb_build_object(
    'code', c.code, 'vehicle_no', c.vehicle_no, 'driver_name', c.driver_name, 'driver_phone', c.driver_phone,
    'origin', c.origin, 'destination', c.destination, 'cargo', c.cargo, 'status', c.status,
    'last_lat', c.last_lat, 'last_lng', c.last_lng, 'last_accuracy', c.last_accuracy, 'last_seen', c.last_seen,
    'created_at', c.created_at,
    'origin_lat', c.origin_lat, 'origin_lng', c.origin_lng, 'dest_lat', c.dest_lat, 'dest_lng', c.dest_lng,
    'started', c.trip_started_at is not null,
    'lost', c.status = 'in_transit' and c.trip_started_at is not null
            and (c.lost_at is not null or coalesce(c.last_seen, c.trip_started_at) < now() - interval '5 minutes'),
    'trail', coalesce((select jsonb_agg(jsonb_build_object('lat', p.lat, 'lng', p.lng, 'at', p.at) order by p.id)
                       from (select * from public.consignment_points where code = c.code order by id desc limit 60) p), '[]'::jsonb)
  ) end
  from (select 1) one left join public.consignments c on c.code = upper(trim(p_code))
$$;

-- The email kinds: the one complete list (the same in every migration that sets it, newest: this one).
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'help_new', 'help_ack', 'help_reply', 'help_resolved', 'payout_changed', 'password_changed', 'email_changed', 'phone_changed', 'new_signin', 'signin_locked', 'team_changed', 'trip_lost'));

-- Trips with no position for 5 minutes: mark them lost, write it in the events, and queue one
-- email to the sender (again only after the trip has been back and is lost again).
create or replace function public.kr_trip_watch_now() returns integer
language plpgsql security definer set search_path = public as $$
declare
  c record;
  n integer := 0;
begin
  for c in
    select * from public.consignments
     where status = 'in_transit' and trip_started_at is not null and lost_at is null
       and coalesce(last_seen, trip_started_at) < now() - interval '5 minutes'
     order by coalesce(last_seen, trip_started_at)
     limit 50
     for update skip locked
  loop
    update public.consignments set lost_at = now() where code = c.code;
    insert into public.consignment_events (code, kind, detail)
    values (c.code, 'lost', case when c.last_seen is null then 'no position since the trip started' else 'last position ' || to_char(c.last_seen at time zone 'Asia/Kolkata', 'DD Mon HH24:MI') || ' IST' end);
    insert into public.email_outbox (kind, user_id, ref, detail)
    values ('trip_lost', c.owner_id, c.code,
            left(c.origin || ' → ' || c.destination || coalesce(' · last seen ' || to_char(c.last_seen at time zone 'Asia/Kolkata', 'HH24:MI') || ' IST', ''), 80));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.kr_trip_watch_now() from public, anon, authenticated;

-- For the KashRoot server (KYC_DB_SECRET), before it sends emails.
create or replace function public.kr_trip_watch(p_secret text) returns integer
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select kyc_secret into s from public.kr_settings where id = 1;
  if s is null or p_secret is null or p_secret <> s then raise exception 'not allowed' using errcode = '42501'; end if;
  return public.kr_trip_watch_now();
end $$;
revoke all on function public.kr_trip_watch(text) from public;
grant execute on function public.kr_trip_watch(text) to anon, authenticated;

-- Every 5 minutes, when pg_cron is enabled (Supabase → Database → Extensions → pg_cron). Without it,
-- the server's email runs (each tracking page asks for one) do the same.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'kashroot-trip-watch';
    perform cron.schedule('kashroot-trip-watch', '*/5 * * * *', 'select public.kr_trip_watch_now()');
  end if;
exception when others then
  raise notice 'pg_cron not used: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
