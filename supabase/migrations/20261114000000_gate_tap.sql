-- KashRoot: the Super Admin's switch "Ask everyone to tap the box" for the
-- security gate (components/security/SecurityGate). Off (the default):
-- Cloudflare's Managed check decides — most people pass without a tap. On:
-- everyone also presses "Tap to confirm you're human" before the gate's token
-- is sent. It is a step people notice, not a stronger proof (Cloudflare's
-- token, checked on the server, is the proof); it costs a moment for farmers
-- on small screens and slow phones.
--   kr_gate_settings()          → { tap } — anyone (the gate reads it)
--   kr_super_set_gate_tap(on)   — the Super Admin only, audited
-- Run after 20261113000000_super_admin.sql. Safe to run again.

alter table public.kr_settings add column if not exists gate_tap boolean not null default false;

create or replace function public.kr_gate_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tap', coalesce((select gate_tap from public.kr_settings where id = 1), false))
$$;
grant execute on function public.kr_gate_settings() to anon, authenticated;

create or replace function public.kr_super_set_gate_tap(p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare was boolean;
begin
  if not public.kr_is_super_admin() then raise exception 'Only the Super Admin can do this.' using errcode = '42501'; end if;
  insert into public.kr_settings (id) values (1) on conflict (id) do nothing;
  select gate_tap into was from public.kr_settings where id = 1;
  update public.kr_settings set gate_tap = coalesce(p_on, false), updated_at = now() where id = 1;
  perform public.kr_audit('set_gate_tap', 'security gate', jsonb_build_object('tap', was), jsonb_build_object('tap', coalesce(p_on, false)), null);
  return coalesce(p_on, false);
end $$;
revoke all on function public.kr_super_set_gate_tap(boolean) from public, anon;
grant execute on function public.kr_super_set_gate_tap(boolean) to authenticated;

notify pgrst, 'reload schema';
