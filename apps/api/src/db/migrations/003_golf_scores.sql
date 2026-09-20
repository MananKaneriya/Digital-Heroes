-- ============================================================================
-- Digital Heroes — Migration 003: Golf Scores (Phase C)
-- ============================================================================

-- ---- golf_scores --------------------------------------------------------
-- One row per subscriber per round. The unique constraint on (user_id, score_date)
-- is the database-level enforcement of "only one score per date" (PRD §6.2) — the
-- API's pre-check is a UX convenience, not the source of truth. The CHECK constraint
-- enforces the 1–45 Stableford range (PRD §6.1) even if application-layer validation
-- is ever bypassed or has a bug.
create table if not exists public.golf_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null check (score >= 1 and score <= 45),
  score_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, score_date)
);

create index if not exists golf_scores_user_date_idx on public.golf_scores (user_id, score_date desc);

drop trigger if exists golf_scores_set_updated_at on public.golf_scores;
create trigger golf_scores_set_updated_at
  before update on public.golf_scores
  for each row execute function public.set_updated_at();

alter table public.golf_scores enable row level security;
drop policy if exists golf_scores_select_own_or_admin on public.golf_scores;
create policy golf_scores_select_own_or_admin on public.golf_scores
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- No insert/update/delete policies are defined for anon/authenticated: exactly like
-- subscriptions and payment_events, all writes go through the API using the
-- service-role key, which bypasses RLS under its own server-side authorization checks.

-- ---- create_golf_score_with_retention ------------------------------------
-- Atomically inserts a new score and enforces the "latest N retained scores" rule
-- (PRD §6.3) inside a single implicit transaction, so a crash between the insert and
-- the retention cleanup can never leave more than N rows behind — the unsafe
-- "INSERT, then a separate DELETE afterwards" sequence the PRD explicitly warns
-- against (§11) is not possible here because both steps happen in one function call.
--
-- Retention is ranked strictly by score_date, never by created_at or insertion order
-- (PRD §6, "important date semantics"); created_at is only a tiebreaker for
-- determinism and cannot actually apply in practice since (user_id, score_date) is
-- unique. This is the same algorithm implemented as a pure, unit-tested function in
-- apps/api/src/modules/scores/scoreRetention.ts.
create or replace function public.create_golf_score_with_retention(
  p_user_id uuid,
  p_score integer,
  p_score_date date,
  p_max_retained integer default 5
)
returns jsonb
language plpgsql
as $$
declare
  v_row public.golf_scores%rowtype;
  v_removed_ids uuid[];
begin
  insert into public.golf_scores (user_id, score, score_date)
  values (p_user_id, p_score, p_score_date)
  returning * into v_row;

  select coalesce(array_agg(id), '{}')
    into v_removed_ids
  from (
    select id
    from public.golf_scores
    where user_id = p_user_id
    order by score_date desc, created_at desc
    offset p_max_retained
  ) as overflow;

  if array_length(v_removed_ids, 1) > 0 then
    delete from public.golf_scores where id = any (v_removed_ids);
  end if;

  return jsonb_build_object(
    'score', to_jsonb(v_row),
    'removedIds', to_jsonb(coalesce(v_removed_ids, '{}'))
  );
end;
$$;

revoke all on function public.create_golf_score_with_retention(uuid, integer, date, integer) from public, anon, authenticated;
grant execute on function public.create_golf_score_with_retention(uuid, integer, date, integer) to service_role;
