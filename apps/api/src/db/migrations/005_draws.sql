-- ============================================================================
-- Digital Heroes — Migration 005: Monthly Draw (Phase E, assessment implementation)
--
-- There is no authoritative Phase E product specification in this repository.
-- Every rule encoded below beyond direct reuse of Phase A–D tables is an
-- explicit assessment assumption (participant numbers = 5 retained Stableford
-- scores, frequency-weighted winning-number draw, fixed 40/35/25 tier split,
-- 5-match-only jackpot rollover, admin-supplied prize pool). See the Phase E
-- implementation report for the full list. Not applied to any database by
-- this commit — reviewed and applied only once explicitly authorized.
-- ============================================================================

-- ---- draws --------------------------------------------------------------
-- One row per calendar-month draw period. Lifecycle: draft -> simulated
-- (repeatable candidate result) -> published (frozen, immutable). Winning
-- numbers, the RNG seed, and both jackpot-rollover figures are all written at
-- simulate time so publish is a pure status flip + lock, never a recompute.
create table if not exists public.draws (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'simulated', 'published')),
  prize_pool_cents integer not null default 0 check (prize_pool_cents >= 0),
  -- Unclaimed 5-match allocation inherited from the prior published draw (0 if none/claimed).
  jackpot_rollover_in_cents integer not null default 0 check (jackpot_rollover_in_cents >= 0),
  -- This draw's 5-match allocation, carried out to the next draw if nobody hit 5 here (else 0).
  jackpot_rollover_out_cents integer not null default 0 check (jackpot_rollover_out_cents >= 0),
  -- 5 unique integers 1–45; uniqueness/range enforced in application code (drawEngine.ts),
  -- not duplicated as a DB constraint here to keep this migration simple.
  winning_numbers integer[] check (winning_numbers is null or array_length(winning_numbers, 1) = 5),
  rng_method text,
  rng_seed text,
  simulated_at timestamptz,
  simulated_by uuid references public.profiles (id),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_start, period_end)
);

create index if not exists draws_status_idx on public.draws (status);
create index if not exists draws_period_start_idx on public.draws (period_start desc);

drop trigger if exists draws_set_updated_at on public.draws;
create trigger draws_set_updated_at
  before update on public.draws
  for each row execute function public.set_updated_at();

-- Historical immutability (req. 8/9): once published, a draw row can never be
-- updated or deleted. Named to sort alphabetically before draws_set_updated_at
-- so it runs first and blocks the update before that trigger even fires.
create or replace function public.prevent_published_draw_mutation()
returns trigger as $$
begin
  if old.status = 'published' then
    raise exception 'Published draws are immutable and cannot be modified or deleted.';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists draws_prevent_published_mutation on public.draws;
create trigger draws_prevent_published_mutation
  before update or delete on public.draws
  for each row execute function public.prevent_published_draw_mutation();

alter table public.draws enable row level security;
drop policy if exists draws_select_published_or_admin on public.draws;
create policy draws_select_published_or_admin on public.draws
  for select using (status = 'published' or public.is_admin(auth.uid()));

-- ---- draw_entries --------------------------------------------------------
-- Frozen per-draw snapshot of eligible participants and the exact numbers
-- (their 5 retained Stableford scores at simulate time) used for that draw.
-- Never recomputed after the fact — golf_scores can keep changing without
-- affecting a draw that has already been simulated/published (req. 3).
create table if not exists public.draw_entries (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  numbers integer[] not null check (array_length(numbers, 1) = 5),
  -- Traceability to the golf_scores rows this snapshot was built from.
  score_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (draw_id, user_id)
);

create index if not exists draw_entries_draw_idx on public.draw_entries (draw_id);

alter table public.draw_entries enable row level security;
drop policy if exists draw_entries_select_own_published_or_admin on public.draw_entries;
create policy draw_entries_select_own_published_or_admin on public.draw_entries
  for select using (
    public.is_admin(auth.uid())
    or (auth.uid() = user_id and exists (select 1 from public.draws d where d.id = draw_entries.draw_id and d.status = 'published'))
  );

-- ---- draw_matches --------------------------------------------------------
-- Stored (not recomputed on read) per-participant match result for a draw, so
-- a published result can never silently drift from what was actually computed.
create table if not exists public.draw_matches (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_count integer not null check (match_count >= 0 and match_count <= 5),
  tier integer check (tier in (3, 4, 5)),
  prize_amount_cents integer not null default 0 check (prize_amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (draw_id, user_id)
);

create index if not exists draw_matches_draw_idx on public.draw_matches (draw_id);
create index if not exists draw_matches_user_idx on public.draw_matches (user_id);

alter table public.draw_matches enable row level security;
drop policy if exists draw_matches_select_own_published_or_admin on public.draw_matches;
create policy draw_matches_select_own_published_or_admin on public.draw_matches
  for select using (
    public.is_admin(auth.uid())
    or (auth.uid() = user_id and exists (select 1 from public.draws d where d.id = draw_matches.draw_id and d.status = 'published'))
  );

-- ---- draw_payouts --------------------------------------------------------
-- Payout amount/status bookkeeping only (req. 10) — no real money movement,
-- Stripe Connect, or banking integration; this is an assessment project.
-- Created for every prize-winning match once its draw is published (never at
-- simulate time, since a simulation is only a candidate result).
create table if not exists public.draw_payouts (
  id uuid primary key default gen_random_uuid(),
  draw_match_id uuid not null references public.draw_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  -- Free-text record-keeping only (e.g. "bank_transfer", "manual") — no payment
  -- processor integration; this assessment records payouts, it never moves money.
  method text,
  -- Set when status transitions to a terminal state (paid/failed), not on creation.
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draw_match_id)
);

create index if not exists draw_payouts_user_idx on public.draw_payouts (user_id);

drop trigger if exists draw_payouts_set_updated_at on public.draw_payouts;
create trigger draw_payouts_set_updated_at
  before update on public.draw_payouts
  for each row execute function public.set_updated_at();

alter table public.draw_payouts enable row level security;
drop policy if exists draw_payouts_select_own_published_or_admin on public.draw_payouts;
create policy draw_payouts_select_own_published_or_admin on public.draw_payouts
  for select using (
    public.is_admin(auth.uid())
    or (
      auth.uid() = user_id
      and exists (
        select 1
        from public.draw_matches dm
        join public.draws d on d.id = dm.draw_id
        where dm.id = draw_payouts.draw_match_id and d.status = 'published'
      )
    )
  );

-- No insert/update/delete policies are defined for anon/authenticated on any
-- of the four tables above: exactly like subscriptions/payment_events/
-- charity_contributions, all writes go through the API using the service-role
-- key, which bypasses RLS under its own server-side authorization checks.
