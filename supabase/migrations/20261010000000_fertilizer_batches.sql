-- Shared fertiliser / agro-input batch registry.
-- Anyone can look a batch up; only accounts an administrator has approved as
-- DEALER, MANUFACTURER or ADMIN (set in app_metadata, which users cannot edit)
-- can register or edit batches.
--
-- Run once: Supabase dashboard → SQL Editor → paste → Run.
-- Approve a dealer: Authentication → Users → user → edit "Raw app meta data":
--   { "role": "DEALER" }

create table if not exists public.fertilizer_batches (
  batch_code    text primary key check (char_length(batch_code) between 3 and 40),
  product       text not null,
  manufacturer  text not null,
  grade         text,
  mfg_date      date,
  expiry_date   date,
  registered_by uuid default auth.uid() references auth.users (id) on delete set null,
  registered_at timestamptz not null default now()
);

alter table public.fertilizer_batches enable row level security;

drop policy if exists "Anyone can verify a batch" on public.fertilizer_batches;
create policy "Anyone can verify a batch"
  on public.fertilizer_batches for select
  using (true);

drop policy if exists "Approved dealers register batches" on public.fertilizer_batches;
create policy "Approved dealers register batches"
  on public.fertilizer_batches for insert to authenticated
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('DEALER', 'MANUFACTURER', 'ADMIN')
    and registered_by = auth.uid()
  );

drop policy if exists "Dealers edit their own batches" on public.fertilizer_batches;
create policy "Dealers edit their own batches"
  on public.fertilizer_batches for update to authenticated
  using (registered_by = auth.uid())
  with check (registered_by = auth.uid());
