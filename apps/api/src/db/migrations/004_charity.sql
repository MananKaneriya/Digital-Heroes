-- ============================================================================
-- Digital Heroes — Migration 004: Charity System (Phase D)
-- ============================================================================

-- ---- charities --------------------------------------------------------
create table if not exists public.charities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  short_description text not null default '',
  full_description text not null default '',
  logo_path text,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charities_active_idx on public.charities (is_active);
-- At most one charity can be featured at a time (PRD §10: homepage spotlight).
create unique index if not exists charities_single_featured_idx on public.charities ((is_featured)) where is_featured;

drop trigger if exists charities_set_updated_at on public.charities;
create trigger charities_set_updated_at
  before update on public.charities
  for each row execute function public.set_updated_at();

alter table public.charities enable row level security;
drop policy if exists charities_select_active_or_admin on public.charities;
create policy charities_select_active_or_admin on public.charities
  for select using (is_active or public.is_admin(auth.uid()));

-- ---- charity_media --------------------------------------------------------
create table if not exists public.charity_media (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  storage_path text not null,
  media_type text not null default 'image' check (media_type in ('image')),
  alt_text text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists charity_media_charity_idx on public.charity_media (charity_id, display_order);

alter table public.charity_media enable row level security;
drop policy if exists charity_media_select_via_active_charity on public.charity_media;
create policy charity_media_select_via_active_charity on public.charity_media
  for select using (
    public.is_admin(auth.uid())
    or exists (select 1 from public.charities c where c.id = charity_media.charity_id and c.is_active)
  );

-- ---- charity_events --------------------------------------------------------
create table if not exists public.charity_events (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  title text not null,
  description text not null default '',
  event_date date not null,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charity_events_charity_idx on public.charity_events (charity_id, event_date);

drop trigger if exists charity_events_set_updated_at on public.charity_events;
create trigger charity_events_set_updated_at
  before update on public.charity_events
  for each row execute function public.set_updated_at();

alter table public.charity_events enable row level security;
drop policy if exists charity_events_select_via_active_charity on public.charity_events;
create policy charity_events_select_via_active_charity on public.charity_events
  for select using (
    public.is_admin(auth.uid())
    or (is_active and exists (select 1 from public.charities c where c.id = charity_events.charity_id and c.is_active))
  );

-- ---- charity_selections --------------------------------------------------------
-- One row per subscriber representing their *current* charity + contribution
-- percentage, exactly like the subscriptions table represents current
-- subscription state. Historical contribution amounts are preserved
-- separately in charity_contributions, which snapshots this selection at the
-- moment each billing period's contribution is calculated (PRD §6: changing
-- charity must never rewrite already-finalized historical records).
create table if not exists public.charity_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  charity_id uuid not null references public.charities (id),
  contribution_percent numeric(5, 2) not null check (contribution_percent >= 10 and contribution_percent <= 100),
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charity_selections_charity_idx on public.charity_selections (charity_id);

drop trigger if exists charity_selections_set_updated_at on public.charity_selections;
create trigger charity_selections_set_updated_at
  before update on public.charity_selections
  for each row execute function public.set_updated_at();

alter table public.charity_selections enable row level security;
drop policy if exists charity_selections_select_own_or_admin on public.charity_selections;
create policy charity_selections_select_own_or_admin on public.charity_selections
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- ---- charity_contributions --------------------------------------------------------
-- The actual historical financial record generated once per subscription billing
-- period (PRD §10.1/§19: financial records must be auditable and never
-- silently recalculated from today's configuration). subscription_amount_cents
-- and contribution_percent are snapshotted at creation time — later changes to
-- the plan price or the subscriber's selection never alter this row.
-- unique(user_id, period_end) makes contribution generation idempotent: the
-- same billing period can never produce two contribution records.
create table if not exists public.charity_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  charity_id uuid not null references public.charities (id),
  contribution_percent numeric(5, 2) not null,
  subscription_amount_cents integer not null check (subscription_amount_cents >= 0),
  contribution_cents integer not null check (contribution_cents >= 0),
  period_end timestamptz not null,
  status text not null default 'recorded' check (status in ('recorded', 'reversed')),
  created_at timestamptz not null default now(),
  unique (user_id, period_end)
);

create index if not exists charity_contributions_charity_idx on public.charity_contributions (charity_id);
create index if not exists charity_contributions_user_idx on public.charity_contributions (user_id);

alter table public.charity_contributions enable row level security;
drop policy if exists charity_contributions_select_own_or_admin on public.charity_contributions;
create policy charity_contributions_select_own_or_admin on public.charity_contributions
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- ---- independent_donations --------------------------------------------------------
-- Explicitly separate from subscriptions/charity_contributions (PRD §7: an
-- independent donation must never increase draw eligibility, prize pool, or
-- count as a subscription contribution). No foreign key to subscriptions.
create table if not exists public.independent_donations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  charity_id uuid not null references public.charities (id),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  stripe_checkout_session_id text unique,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists independent_donations_charity_idx on public.independent_donations (charity_id);
create index if not exists independent_donations_user_idx on public.independent_donations (user_id);

drop trigger if exists independent_donations_set_updated_at on public.independent_donations;
create trigger independent_donations_set_updated_at
  before update on public.independent_donations
  for each row execute function public.set_updated_at();

alter table public.independent_donations enable row level security;
drop policy if exists independent_donations_select_own_or_admin on public.independent_donations;
create policy independent_donations_select_own_or_admin on public.independent_donations
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- ---- storage: charity-media bucket --------------------------------------------------------
-- Public bucket: charity images are public-facing marketing content, not
-- sensitive like winner-verification proof (that gets a private bucket in a
-- later phase). All writes go through the API using the service-role key
-- (which bypasses storage RLS entirely), so no insert/update/delete policy is
-- granted to anon/authenticated — only the explicit public-read policy below.
insert into storage.buckets (id, name, public)
values ('charity-media', 'charity-media', true)
on conflict (id) do nothing;

drop policy if exists charity_media_public_read on storage.objects;
create policy charity_media_public_read on storage.objects
  for select using (bucket_id = 'charity-media');
