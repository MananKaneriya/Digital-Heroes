-- ============================================================================
-- Digital Heroes — Migration 002: Subscriptions & Payments
-- ============================================================================

-- ---- subscription_plans ------------------------------------------------------
-- Authoritative plan configuration (PRD §5.1: "Plan data must be configurable
-- rather than duplicated throughout the codebase."). Seeded by
-- apps/api/src/db/seed/seed.ts from packages/shared/src/planConfig.ts.
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('monthly', 'yearly')),
  name text not null,
  billing_interval text not null check (billing_interval in ('month', 'year')),
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'usd',
  description text not null default '',
  stripe_price_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists subscription_plans_set_updated_at on public.subscription_plans;
create trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;
drop policy if exists subscription_plans_select_active on public.subscription_plans;
create policy subscription_plans_select_active on public.subscription_plans
  for select using (is_active = true or public.is_admin(auth.uid()));

-- ---- payment_customers --------------------------------------------------------
-- Maps a user to their payment-provider customer id. Never holds card data
-- (PRD §5.2: "Do not store raw payment-card details.").
create table if not exists public.payment_customers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

alter table public.payment_customers enable row level security;
revoke all on public.payment_customers from anon, authenticated;

-- ---- subscriptions --------------------------------------------------------
-- One row per user representing their *current* subscription state. History
-- of transitions lives in audit_logs; this table is always the live snapshot
-- the access-control middleware reads (PRD §5.3/§5.4).
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  stripe_customer_id text not null,
  stripe_subscription_id text unique,
  status text not null check (status in ('incomplete', 'active', 'past_due', 'canceled', 'lapsed')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_status_idx on public.subscriptions (status);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_select_own_or_admin on public.subscriptions;
create policy subscriptions_select_own_or_admin on public.subscriptions
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- ---- payment_events --------------------------------------------------------
-- Idempotency ledger for payment-provider webhook events (PRD §29: "Do not
-- create duplicate subscription/payment records when the same event is
-- delivered more than once."). The unique constraint on stripe_event_id is
-- the enforcement mechanism, not just an application-level check.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_type_idx on public.payment_events (type);

alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;
