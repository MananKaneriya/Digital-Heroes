-- ============================================================================
-- Digital Heroes — Migration 006: Winner Verification (Phase F)
--
-- Reuses the existing Phase E winner record (a `draw_matches` row with a
-- non-null tier) rather than creating a second winner table. This is a
-- companion 1:1 table exactly like `draw_payouts` already is — one row per
-- winning match, holding only verification-workflow state.
-- ============================================================================

create table if not exists public.winner_verifications (
  id uuid primary key default gen_random_uuid(),
  draw_match_id uuid not null references public.draw_matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'approved', 'rejected')),
  proof_storage_path text,
  proof_uploaded_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draw_match_id)
);

create index if not exists winner_verifications_user_idx on public.winner_verifications (user_id);
create index if not exists winner_verifications_status_idx on public.winner_verifications (status);

drop trigger if exists winner_verifications_set_updated_at on public.winner_verifications;
create trigger winner_verifications_set_updated_at
  before update on public.winner_verifications
  for each row execute function public.set_updated_at();

alter table public.winner_verifications enable row level security;
drop policy if exists winner_verifications_select_own_or_admin on public.winner_verifications;
create policy winner_verifications_select_own_or_admin on public.winner_verifications
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- No insert/update/delete policy for anon/authenticated: exactly like every
-- other table in this project, all writes go through the API's service-role
-- client, which enforces the verification state machine and ownership itself.

-- ---- storage: winner-proof bucket (PRIVATE) --------------------------------
-- Unlike charity-media, this bucket is NOT public. Winner proof is sensitive
-- and must never be reachable by a bare URL — the API only ever hands out
-- short-lived signed URLs to the winner themselves or an admin, generated
-- with the service-role key (which bypasses this bucket's lack of RLS grants
-- entirely). No select/insert/update/delete policy is defined for
-- anon/authenticated on storage.objects for this bucket, so direct access is
-- denied by default.
insert into storage.buckets (id, name, public)
values ('winner-proof', 'winner-proof', false)
on conflict (id) do nothing;
