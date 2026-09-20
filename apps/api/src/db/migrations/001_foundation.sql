-- ============================================================================
-- Digital Heroes — Migration 001: Foundation (auth, roles, audit log)
-- Run against a Supabase/Postgres project via the Supabase SQL editor or CLI.
-- ============================================================================

-- ---- profiles ---------------------------------------------------------------
-- Extends Supabase's built-in auth.users with the app-specific role and a
-- denormalized copy of email/full_name so the app can query/search without
-- privileged access to the auth schema.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'subscriber' check (role in ('subscriber', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_email_idx on public.profiles (email);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Automatically creates a profile row (role defaults to 'subscriber') whenever
-- a new Supabase Auth user is created, reading full_name from signup metadata.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin(uid uuid)
returns boolean as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin');
$$ language sql stable security definer set search_path = public;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
  for select using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---- audit_logs --------------------------------------------------------------
-- Immutable audit trail (PRD §19). Only the service-role key (used exclusively
-- by trusted backend code, see apps/api/src/modules/audit) can read or write
-- this table — RLS is enabled with no policies, so the anon/authenticated
-- roles have zero access, and there is no update/delete path for anyone.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
