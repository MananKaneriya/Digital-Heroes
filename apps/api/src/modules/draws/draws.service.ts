import { randomInt } from "node:crypto";
import {
  DRAW_NUMBER_MAX,
  DRAW_NUMBER_MIN,
  DRAW_NUMBERS_COUNT,
  TIER_ALLOCATION_PERCENT,
  grantsAccess,
  type DrawAdminMatchDTO,
  type DrawDTO,
  type DrawMyResultDTO,
  type DrawPayoutStatus,
  type DrawTierSummaryDTO,
  type MatchTier,
  type SimulateDrawInput,
  type SubscriptionStatus,
  type WinnerVerificationStatus,
} from "@digital-heroes/shared";
import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { recordAudit } from "../audit/audit.service.js";
import { selectRetainedScoreIds } from "../scores/scoreRetention.js";
import { allocatePrizes, countMatches, generateWinningNumbers, getCalendarMonthBounds, RNG_METHOD, tierForMatchCount } from "./drawEngine.js";

interface DrawRow {
  id: string;
  period_start: string;
  period_end: string;
  status: "draft" | "simulated" | "published";
  prize_pool_cents: number;
  jackpot_rollover_in_cents: number;
  jackpot_rollover_out_cents: number;
  winning_numbers: number[] | null;
  rng_method: string | null;
  rng_seed: string | null;
  simulated_at: string | null;
  published_at: string | null;
  created_at: string;
}

function drawRowToDTO(row: DrawRow): DrawDTO {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    prizePoolCents: row.prize_pool_cents,
    jackpotRolloverInCents: row.jackpot_rollover_in_cents,
    jackpotRolloverOutCents: row.jackpot_rollover_out_cents,
    winningNumbers: row.winning_numbers,
    rngMethod: row.rng_method,
    rngSeed: row.rng_seed,
    simulatedAt: row.simulated_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

interface EligibleParticipant {
  userId: string;
  numbers: number[];
  scoreIds: string[];
}

/**
 * Eligibility (assumption 2): an active/past-due subscription (the same
 * `grantsAccess` rule `hasActiveAccess()` uses elsewhere, applied in bulk here
 * for efficiency) AND exactly 5 retained golf scores. Independent donations
 * are never consulted — there is no code path here that reads that table.
 */
async function resolveEligibleParticipants(): Promise<EligibleParticipant[]> {
  const { data: subRows, error: subError } = await supabaseAdmin.from("subscriptions").select("user_id, status, current_period_end");
  if (subError) throw AppError.internal("Failed to load subscriptions for eligibility.");

  const activeUserIds = (subRows ?? [])
    .filter((r) => grantsAccess(r.status as SubscriptionStatus, r.current_period_end))
    .map((r) => r.user_id as string);
  if (activeUserIds.length === 0) return [];

  const { data: scoreRows, error: scoreError } = await supabaseAdmin
    .from("golf_scores")
    .select("id, user_id, score, score_date")
    .in("user_id", activeUserIds);
  if (scoreError) throw AppError.internal("Failed to load golf scores for eligibility.");

  const byUser = new Map<string, { id: string; score: number; score_date: string }[]>();
  for (const row of scoreRows ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  const participants: EligibleParticipant[] = [];
  for (const userId of activeUserIds) {
    const rows = byUser.get(userId) ?? [];
    const { retainedIds } = selectRetainedScoreIds(
      rows.map((r) => ({ id: r.id, scoreDate: r.score_date })),
      DRAW_NUMBERS_COUNT,
    );
    if (retainedIds.length !== DRAW_NUMBERS_COUNT) continue; // incomplete entry (assumption 2) — not eligible

    const retainedSet = new Set(retainedIds);
    const retainedRows = rows.filter((r) => retainedSet.has(r.id));
    participants.push({
      userId,
      numbers: retainedRows.map((r) => r.score).sort((a, b) => a - b),
      scoreIds: retainedRows.map((r) => r.id),
    });
  }
  return participants;
}

/** The most recent published draw's unclaimed 5-match pool, if any (0 otherwise). */
async function resolvePreviousJackpotRollover(periodStart: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("draws")
    .select("jackpot_rollover_out_cents")
    .eq("status", "published")
    .lt("period_start", periodStart)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw AppError.internal("Failed to resolve jackpot rollover from the prior draw.");
  return data?.jackpot_rollover_out_cents ?? 0;
}

/**
 * Simulates (or re-simulates) a candidate draw result for a calendar month.
 * Safe to call repeatedly while the draw isn't published yet — each call
 * overwrites the prior candidate entries/matches; nothing here ever touches a
 * published draw (req. 8/9).
 */
export async function simulateDraw(adminId: string, input: SimulateDrawInput, requestId: string): Promise<DrawDTO> {
  const { periodStart, periodEnd } = getCalendarMonthBounds(input.month);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("draws")
    .select("*")
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();
  if (existingError) throw AppError.internal("Failed to look up the draw for this period.");
  if (existing && (existing as DrawRow).status === "published") {
    throw AppError.conflict("This draw has already been published and cannot be re-simulated.");
  }

  const jackpotRolloverInCents = await resolvePreviousJackpotRollover(periodStart);
  const participants = await resolveEligibleParticipants();

  const seed = input.seed ?? randomInt(1, 2_147_483_647);
  const winningNumbers = generateWinningNumbers({
    participantNumbers: participants.map((p) => p.numbers),
    min: DRAW_NUMBER_MIN,
    max: DRAW_NUMBER_MAX,
    count: DRAW_NUMBERS_COUNT,
    seed,
  });

  const matches = participants.map((p) => ({ userId: p.userId, matchCount: countMatches(p.numbers, winningNumbers) }));
  const { tiers, jackpotCarriedForwardCents } = allocatePrizes({
    prizePoolCents: input.prizePoolCents,
    jackpotRolloverCents: jackpotRolloverInCents,
    entries: matches,
  });

  const { data: drawRow, error: drawError } = await supabaseAdmin
    .from("draws")
    .upsert(
      {
        ...(existing ? { id: (existing as DrawRow).id } : {}),
        period_start: periodStart,
        period_end: periodEnd,
        status: "simulated",
        prize_pool_cents: input.prizePoolCents,
        jackpot_rollover_in_cents: jackpotRolloverInCents,
        jackpot_rollover_out_cents: jackpotCarriedForwardCents,
        winning_numbers: winningNumbers,
        rng_method: RNG_METHOD,
        rng_seed: String(seed),
        simulated_at: new Date().toISOString(),
        simulated_by: adminId,
      },
      { onConflict: "period_start,period_end" },
    )
    .select("*")
    .single();
  if (drawError) throw AppError.internal("Failed to save the simulated draw.");

  const drawId = (drawRow as DrawRow).id;

  // A re-simulation replaces the prior candidate entirely — this only ever runs
  // pre-publish (guarded above), so there is no historical result to preserve yet.
  await supabaseAdmin.from("draw_matches").delete().eq("draw_id", drawId);
  await supabaseAdmin.from("draw_entries").delete().eq("draw_id", drawId);

  if (participants.length > 0) {
    const { error: entriesError } = await supabaseAdmin
      .from("draw_entries")
      .insert(participants.map((p) => ({ draw_id: drawId, user_id: p.userId, numbers: p.numbers, score_ids: p.scoreIds })));
    if (entriesError) throw AppError.internal("Failed to save draw entries.");

    const matchRows = matches.map((m) => {
      const tier = tierForMatchCount(m.matchCount);
      const tierResult = tier ? tiers.find((t) => t.tier === tier) : undefined;
      const prizeCents = tierResult?.winners.find((w) => w.userId === m.userId)?.prizeCents ?? 0;
      return { draw_id: drawId, user_id: m.userId, match_count: m.matchCount, tier, prize_amount_cents: prizeCents };
    });
    const { error: matchesError } = await supabaseAdmin.from("draw_matches").insert(matchRows);
    if (matchesError) throw AppError.internal("Failed to save draw matches.");
  }

  await recordAudit({
    actorId: adminId,
    actorRole: "admin",
    action: "draw.simulated",
    entityType: "draw",
    entityId: drawId,
    newState: {
      periodStart,
      periodEnd,
      prizePoolCents: input.prizePoolCents,
      participantCount: participants.length,
      winningNumbers,
      seed,
      tierWinnerCounts: Object.fromEntries(tiers.map((t) => [t.tier, t.winners.length])),
      jackpotCarriedForwardCents,
    },
    requestId,
  });

  return drawRowToDTO(drawRow as DrawRow);
}

/**
 * Freezes a simulated draw as final (req. 8/9) and creates the pending payout
 * records for every winning match. The `draws` table's own DB trigger blocks
 * any further update/delete once this succeeds, so a second publish attempt
 * or a re-simulate attempt fails loudly rather than silently overwriting
 * history — enforced both here (status check) and at the database layer.
 */
export async function publishDraw(adminId: string, drawId: string, requestId: string): Promise<DrawDTO> {
  const { data: draw, error } = await supabaseAdmin.from("draws").select("*").eq("id", drawId).maybeSingle();
  if (error) throw AppError.internal("Failed to load the draw.");
  if (!draw) throw AppError.notFound("Draw not found.");
  const row = draw as DrawRow;
  if (row.status === "published") throw AppError.conflict("This draw has already been published.");
  if (row.status !== "simulated") throw AppError.validation("A draw must be simulated before it can be published.");

  // Conditioned on status still being "simulated" (Phase H hardening) — guards
  // against two concurrent publish requests for the same draw. The published-draw
  // immutability trigger and the unique(draw_match_id) constraints below already
  // prevent any actual data corruption from this race; this turns the loser's
  // outcome into a clean, expected 409 rather than a generic 500.
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("draws")
    .update({ status: "published", published_at: new Date().toISOString(), published_by: adminId })
    .eq("id", drawId)
    .eq("status", "simulated")
    .select("*")
    .maybeSingle();
  if (updateError) throw AppError.internal("Failed to publish the draw.");
  if (!updated) throw AppError.conflict("This draw has already been published.");

  const { data: winningMatches, error: matchesError } = await supabaseAdmin
    .from("draw_matches")
    .select("id, user_id, prize_amount_cents")
    .eq("draw_id", drawId)
    .gt("prize_amount_cents", 0);
  if (matchesError) throw AppError.internal("Failed to load draw winners for payout creation.");

  const rows = winningMatches ?? [];
  if (rows.length > 0) {
    const { error: payoutError } = await supabaseAdmin
      .from("draw_payouts")
      .insert(rows.map((m) => ({ draw_match_id: m.id, user_id: m.user_id, amount_cents: m.prize_amount_cents, status: "pending" })));
    if (payoutError) throw AppError.internal("Failed to record payouts.");

    // Phase F: every winning match also gets a verification record, created in
    // the same 'pending' (proof required) state a payout starts in — the one
    // moment a winner comes into existence, exactly like draw_payouts above.
    const { error: verificationError } = await supabaseAdmin
      .from("winner_verifications")
      .insert(rows.map((m) => ({ draw_match_id: m.id, user_id: m.user_id, status: "pending" })));
    if (verificationError) throw AppError.internal("Failed to create winner verification records.");
  }

  await recordAudit({
    actorId: adminId,
    actorRole: "admin",
    action: "draw.published",
    entityType: "draw",
    entityId: drawId,
    previousState: { status: row.status },
    newState: { status: "published", winnerPayoutsCreated: rows.length },
    requestId,
  });

  return drawRowToDTO(updated as DrawRow);
}

export async function updatePayoutStatus(
  adminId: string,
  payoutId: string,
  status: DrawPayoutStatus,
  requestId: string,
  method?: string,
): Promise<void> {
  const { data: before, error: beforeError } = await supabaseAdmin.from("draw_payouts").select("*").eq("id", payoutId).maybeSingle();
  if (beforeError) throw AppError.internal("Failed to load the payout.");
  if (!before) throw AppError.notFound("Payout not found.");

  // Phase F: a paid payout is terminal — never re-processed, whether by a
  // duplicate admin click, a retry, or a race (req. "duplicate payout prevention").
  if (before.status === "paid") throw AppError.conflict("This payout has already been paid and cannot be changed.");

  // Phase F: a winner must be verification-approved before their payout can be
  // marked paid — never gated on "failed", which just records an attempt.
  if (status === "paid") {
    const { data: verification, error: verificationError } = await supabaseAdmin
      .from("winner_verifications")
      .select("status")
      .eq("draw_match_id", before.draw_match_id)
      .maybeSingle();
    if (verificationError) throw AppError.internal("Failed to check winner verification status.");
    if (verification?.status !== "approved") {
      throw AppError.validation("This winner must be verified and approved before the payout can be marked paid.");
    }
  }

  // processed_at marks the terminal transition (paid/failed) only — never set on
  // creation, since "pending" isn't a processing outcome (PRD assumption, §9/§39).
  //
  // The update is conditioned on status still not being "paid" (Phase H
  // hardening): two concurrent "mark paid" requests could otherwise both pass
  // the check above before either writes. `.neq("status","paid")` makes this
  // an atomic check-and-set — if another request already marked it paid,
  // zero rows match and `updated` is null, treated as a conflict rather than
  // silently reprocessing an already-paid payout.
  const { data: updated, error } = await supabaseAdmin
    .from("draw_payouts")
    .update({ status, processed_at: new Date().toISOString(), ...(method ? { method } : {}) })
    .eq("id", payoutId)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();
  if (error) throw AppError.internal("Failed to update the payout.");
  if (!updated) throw AppError.conflict("This payout has already been paid and cannot be changed.");

  await recordAudit({
    actorId: adminId,
    actorRole: "admin",
    action: status === "paid" ? "draw.payout_recorded" : "draw.payout_failed",
    entityType: "draw_payout",
    entityId: payoutId,
    previousState: { status: before.status },
    newState: { status, method: method ?? before.method },
    requestId,
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listPublishedDraws(): Promise<DrawDTO[]> {
  const { data, error } = await supabaseAdmin.from("draws").select("*").eq("status", "published").order("period_start", { ascending: false });
  if (error) throw AppError.internal("Failed to load draws.");
  return (data as DrawRow[]).map(drawRowToDTO);
}

function summarizeTiers(matchRows: { tier: MatchTier; prize_amount_cents: number }[], draw: DrawRow): DrawTierSummaryDTO[] {
  return ([5, 4, 3] as const).map((tier) => {
    const winners = matchRows.filter((m) => m.tier === tier);
    const allocationCents =
      tier === 5
        ? Math.round((draw.prize_pool_cents * TIER_ALLOCATION_PERCENT[5]) / 100) + draw.jackpot_rollover_in_cents
        : Math.round((draw.prize_pool_cents * TIER_ALLOCATION_PERCENT[tier]) / 100);
    return {
      tier,
      allocationCents,
      winnerCount: winners.length,
      totalPaidCents: winners.reduce((sum, w) => sum + w.prize_amount_cents, 0),
    };
  });
}

export async function getPublishedDrawWithTiers(drawId: string): Promise<{ draw: DrawDTO; tiers: DrawTierSummaryDTO[] }> {
  const { data: draw, error } = await supabaseAdmin.from("draws").select("*").eq("id", drawId).eq("status", "published").maybeSingle();
  if (error) throw AppError.internal("Failed to load the draw.");
  if (!draw) throw AppError.notFound("Draw not found.");

  const { data: matchRows, error: matchError } = await supabaseAdmin
    .from("draw_matches")
    .select("tier, prize_amount_cents")
    .eq("draw_id", drawId)
    .not("tier", "is", null);
  if (matchError) throw AppError.internal("Failed to load draw results.");

  return {
    draw: drawRowToDTO(draw as DrawRow),
    tiers: summarizeTiers((matchRows ?? []) as { tier: MatchTier; prize_amount_cents: number }[], draw as DrawRow),
  };
}

export async function getMyDrawResults(userId: string): Promise<DrawMyResultDTO[]> {
  const { data: entryRows, error: entryError } = await supabaseAdmin
    .from("draw_entries")
    .select("draw_id, numbers, draws!inner(period_start, period_end, status, winning_numbers)")
    .eq("user_id", userId)
    .eq("draws.status", "published");
  if (entryError) throw AppError.internal("Failed to load your draw entries.");

  const rows = (entryRows ?? []) as unknown as Array<{
    draw_id: string;
    numbers: number[];
    draws: { period_start: string; period_end: string; winning_numbers: number[] | null };
  }>;
  if (rows.length === 0) return [];

  const drawIds = rows.map((r) => r.draw_id);

  const { data: matchRows, error: matchError } = await supabaseAdmin
    .from("draw_matches")
    .select("id, draw_id, match_count, tier, prize_amount_cents")
    .eq("user_id", userId)
    .in("draw_id", drawIds);
  if (matchError) throw AppError.internal("Failed to load your draw results.");

  const { data: payoutRows, error: payoutError } = await supabaseAdmin.from("draw_payouts").select("draw_match_id, status").eq("user_id", userId);
  if (payoutError) throw AppError.internal("Failed to load your payout status.");

  // Phase F: verification only ever applies to a winning match (non-null tier),
  // so this is scoped to this user's rows only — never another subscriber's.
  const { data: verificationRows, error: verificationError } = await supabaseAdmin
    .from("winner_verifications")
    .select("draw_match_id, status, rejection_reason")
    .eq("user_id", userId);
  if (verificationError) throw AppError.internal("Failed to load your verification status.");

  const matchByDraw = new Map((matchRows ?? []).map((m) => [m.draw_id, m]));
  const payoutByMatchId = new Map((payoutRows ?? []).map((p) => [p.draw_match_id, p.status as DrawPayoutStatus]));
  const verificationByMatchId = new Map(
    (verificationRows ?? []).map((v) => [v.draw_match_id, { status: v.status as WinnerVerificationStatus, reason: v.rejection_reason as string | null }]),
  );

  return rows
    .map((r) => {
      const match = matchByDraw.get(r.draw_id);
      const verification = match ? verificationByMatchId.get(match.id) : undefined;
      return {
        drawId: r.draw_id,
        periodStart: r.draws.period_start,
        periodEnd: r.draws.period_end,
        numbers: r.numbers,
        winningNumbers: r.draws.winning_numbers ?? [],
        matchCount: match?.match_count ?? 0,
        tier: (match?.tier ?? null) as MatchTier | null,
        prizeAmountCents: match?.prize_amount_cents ?? 0,
        payoutStatus: match ? (payoutByMatchId.get(match.id) ?? null) : null,
        drawMatchId: match?.tier != null ? match.id : null,
        verificationStatus: verification?.status ?? null,
        rejectionReason: verification?.reason ?? null,
      };
    })
    .sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
}

export async function adminListDraws(): Promise<DrawDTO[]> {
  const { data, error } = await supabaseAdmin.from("draws").select("*").order("period_start", { ascending: false });
  if (error) throw AppError.internal("Failed to load draws.");
  return (data as DrawRow[]).map(drawRowToDTO);
}

export async function adminGetDrawDetail(drawId: string): Promise<{ draw: DrawDTO; participantCount: number; matches: DrawAdminMatchDTO[] }> {
  const { data: draw, error } = await supabaseAdmin.from("draws").select("*").eq("id", drawId).maybeSingle();
  if (error) throw AppError.internal("Failed to load the draw.");
  if (!draw) throw AppError.notFound("Draw not found.");

  const { data: matchRows, error: matchError } = await supabaseAdmin
    .from("draw_matches")
    .select("id, user_id, match_count, tier, prize_amount_cents, profiles(full_name, email)")
    .eq("draw_id", drawId)
    .order("match_count", { ascending: false });
  if (matchError) throw AppError.internal("Failed to load draw matches.");

  const matchIds = (matchRows ?? []).map((m) => m.id);
  const payoutByMatchId = new Map<string, { id: string; status: DrawPayoutStatus }>();
  if (matchIds.length > 0) {
    const { data: payoutRows, error: payoutError } = await supabaseAdmin
      .from("draw_payouts")
      .select("id, draw_match_id, status")
      .in("draw_match_id", matchIds);
    if (payoutError) throw AppError.internal("Failed to load payout status for this draw.");
    for (const p of payoutRows ?? []) payoutByMatchId.set(p.draw_match_id, { id: p.id, status: p.status as DrawPayoutStatus });
  }

  const { count: participantCount, error: countError } = await supabaseAdmin
    .from("draw_entries")
    .select("*", { count: "exact", head: true })
    .eq("draw_id", drawId);
  if (countError) throw AppError.internal("Failed to count draw entries.");

  return {
    draw: drawRowToDTO(draw as DrawRow),
    participantCount: participantCount ?? 0,
    matches: (matchRows ?? []).map((m) => {
      const payout = payoutByMatchId.get(m.id);
      return {
        userId: m.user_id,
        fullName: (m.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
        email: (m.profiles as unknown as { email: string } | null)?.email ?? "",
        matchCount: m.match_count,
        tier: m.tier as MatchTier | null,
        prizeAmountCents: m.prize_amount_cents,
        payoutId: payout?.id ?? null,
        payoutStatus: payout?.status ?? null,
      };
    }),
  };
}
