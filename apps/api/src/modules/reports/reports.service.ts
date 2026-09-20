import type {
  CharityAnalyticsReportDTO,
  DrawsReportResponseDTO,
  OverviewReportDTO,
  SubscriptionAnalyticsReportDTO,
  SubscriptionStatus,
  WinnerAnalyticsReportDTO,
} from "@digital-heroes/shared";
import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { resolveMatchIdsForStatusFilters } from "../winners/winners.service.js";
import {
  bucketSubscriptions,
  buildDrawAnalyticsRow,
  countActiveSubscribers,
  sumCents,
  summarizeCharityContributions,
  summarizeWinners,
  type MatchForAnalytics,
  type PayoutForAnalytics,
} from "./reportsCalculations.js";
import type { CharitiesReportQuery, DrawsReportQuery, WinnersReportQuery } from "./reports.schemas.js";

function assertNoError(label: string, error: unknown): void {
  if (error) throw AppError.internal(`Failed to load ${label}.`);
}

/**
 * Total prize pool / published draws / total winners are all scoped to
 * PUBLISHED draws only — a simulated-but-unpublished candidate result is not
 * yet a real financial commitment (PRD/Phase E: "simulation is not
 * publication"). Charity contribution and independent-donation totals are
 * always reported separately, never merged into one figure.
 */
export async function getOverviewReport(): Promise<OverviewReportDTO> {
  const [users, subs, publishedDraws, winningMatches, paidPayouts, pendingPayouts, charityContributions, donations] = await Promise.all([
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("subscriptions").select("status, current_period_end"),
    supabaseAdmin.from("draws").select("prize_pool_cents").eq("status", "published"),
    supabaseAdmin.from("draw_matches").select("id, draws!inner(status)").eq("draws.status", "published").not("tier", "is", null),
    supabaseAdmin.from("draw_payouts").select("amount_cents").eq("status", "paid"),
    supabaseAdmin.from("draw_payouts").select("amount_cents").eq("status", "pending"),
    supabaseAdmin.from("charity_contributions").select("contribution_cents"),
    supabaseAdmin.from("independent_donations").select("amount_cents").eq("status", "completed"),
  ]);

  assertNoError("users", users.error);
  assertNoError("subscriptions", subs.error);
  assertNoError("published draws", publishedDraws.error);
  assertNoError("winners", winningMatches.error);
  assertNoError("paid payouts", paidPayouts.error);
  assertNoError("pending payouts", pendingPayouts.error);
  assertNoError("charity contributions", charityContributions.error);
  assertNoError("independent donations", donations.error);

  return {
    totalUsers: users.count ?? 0,
    activeSubscribers: countActiveSubscribers((subs.data ?? []).map((s) => ({ status: s.status as SubscriptionStatus, current_period_end: s.current_period_end }))),
    totalPrizePoolCents: sumCents(publishedDraws.data, "prize_pool_cents"),
    totalWinners: (winningMatches.data ?? []).length,
    totalPaidCents: sumCents(paidPayouts.data, "amount_cents"),
    pendingPayoutsCents: sumCents(pendingPayouts.data, "amount_cents"),
    pendingPayoutsCount: (pendingPayouts.data ?? []).length,
    totalCharityContributionsCents: sumCents(charityContributions.data, "contribution_cents"),
    totalIndependentDonationsCents: sumCents(donations.data, "amount_cents"),
    publishedDraws: (publishedDraws.data ?? []).length,
  };
}

/**
 * Defaults to published-only (see reports.schemas.ts): a draft/simulated
 * draw's winner and prize figures are only a candidate result, not a
 * finalized financial fact, so they are excluded from this report unless the
 * caller explicitly asks for a specific status or `status=all` to review the
 * pipeline. Paginated like every other admin list in this project
 * (charities/winners) — total/page/pageSize alongside the rows.
 */
export async function getDrawAnalytics(query: DrawsReportQuery): Promise<DrawsReportResponseDTO> {
  let countBuilder = supabaseAdmin.from("draws").select("id", { count: "exact", head: true });
  if (query.status !== "all") countBuilder = countBuilder.eq("status", query.status);
  if (query.drawId) countBuilder = countBuilder.eq("id", query.drawId);
  if (query.from) countBuilder = countBuilder.gte("period_start", query.from);
  if (query.to) countBuilder = countBuilder.lte("period_start", query.to);
  const { count, error: countError } = await countBuilder;
  assertNoError("draws", countError);

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let drawsBuilder = supabaseAdmin.from("draws").select("*").order("period_start", { ascending: false });
  if (query.status !== "all") drawsBuilder = drawsBuilder.eq("status", query.status);
  if (query.drawId) drawsBuilder = drawsBuilder.eq("id", query.drawId);
  if (query.from) drawsBuilder = drawsBuilder.gte("period_start", query.from);
  if (query.to) drawsBuilder = drawsBuilder.lte("period_start", query.to);
  const { data: draws, error: drawsError } = await drawsBuilder.range(from, to);
  assertNoError("draws", drawsError);

  const drawRows = draws ?? [];
  if (drawRows.length === 0) return { draws: [], total: count ?? 0, page: query.page, pageSize: query.pageSize };

  const drawIds = drawRows.map((d) => d.id);

  const { data: entryRows, error: entryError } = await supabaseAdmin.from("draw_entries").select("draw_id").in("draw_id", drawIds);
  assertNoError("draw entries", entryError);
  const entryCountByDraw = new Map<string, number>();
  for (const e of entryRows ?? []) entryCountByDraw.set(e.draw_id, (entryCountByDraw.get(e.draw_id) ?? 0) + 1);

  const { data: matchRows, error: matchError } = await supabaseAdmin
    .from("draw_matches")
    .select("id, draw_id, tier, prize_amount_cents")
    .in("draw_id", drawIds)
    .not("tier", "is", null);
  assertNoError("draw matches", matchError);
  const matches = (matchRows ?? []) as Array<MatchForAnalytics & { draw_id: string }>;

  const matchIds = matches.map((m) => m.id);
  const payoutByMatchId = new Map<string, PayoutForAnalytics>();
  if (matchIds.length > 0) {
    const { data: payoutRows, error: payoutError } = await supabaseAdmin.from("draw_payouts").select("draw_match_id, status, amount_cents").in("draw_match_id", matchIds);
    assertNoError("payouts", payoutError);
    for (const p of payoutRows ?? []) payoutByMatchId.set(p.draw_match_id, p as PayoutForAnalytics);
  }

  return {
    draws: drawRows.map((d) =>
      buildDrawAnalyticsRow(
        d,
        matches.filter((m) => m.draw_id === d.id),
        payoutByMatchId,
        entryCountByDraw.get(d.id) ?? 0,
      ),
    ),
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * Only published draws' winners count (see getOverviewReport's note). Filters
 * on verification/payout status reuse resolveMatchIdsForStatusFilters from
 * the Phase F winners module rather than re-deriving the same lookup here.
 */
export async function getWinnerAnalytics(query: WinnersReportQuery): Promise<WinnerAnalyticsReportDTO> {
  let drawIdFilter: string[] | undefined;
  if (query.from || query.to) {
    let periodBuilder = supabaseAdmin.from("draws").select("id").eq("status", "published");
    if (query.from) periodBuilder = periodBuilder.gte("period_start", query.from);
    if (query.to) periodBuilder = periodBuilder.lte("period_start", query.to);
    const { data, error } = await periodBuilder;
    assertNoError("draws for period filter", error);
    drawIdFilter = (data ?? []).map((d) => d.id);
    if (drawIdFilter.length === 0) return summarizeWinners([], new Map(), []);
  }

  const matchIdFilter = await resolveMatchIdsForStatusFilters({ verificationStatus: query.verificationStatus, payoutStatus: query.payoutStatus });
  if (matchIdFilter && matchIdFilter.length === 0) return summarizeWinners([], new Map(), []);

  let matchBuilder = supabaseAdmin
    .from("draw_matches")
    .select("id, tier, prize_amount_cents, draws!inner(status)")
    .eq("draws.status", "published")
    .not("tier", "is", null);
  if (query.tier) matchBuilder = matchBuilder.eq("tier", query.tier);
  if (query.drawId) matchBuilder = matchBuilder.eq("draw_id", query.drawId);
  if (drawIdFilter) matchBuilder = matchBuilder.in("draw_id", drawIdFilter);
  if (matchIdFilter) matchBuilder = matchBuilder.in("id", matchIdFilter);

  const { data: matchRows, error: matchError } = await matchBuilder;
  assertNoError("winning matches", matchError);
  const matches = (matchRows ?? []) as MatchForAnalytics[];

  const matchIds = matches.map((m) => m.id);
  const payoutByMatchId = new Map<string, PayoutForAnalytics>();
  const verificationStatuses: string[] = [];
  if (matchIds.length > 0) {
    const { data: payoutRows, error: payoutError } = await supabaseAdmin.from("draw_payouts").select("draw_match_id, status, amount_cents").in("draw_match_id", matchIds);
    assertNoError("payouts", payoutError);
    for (const p of payoutRows ?? []) payoutByMatchId.set(p.draw_match_id, p as PayoutForAnalytics);

    const { data: verificationRows, error: verificationError } = await supabaseAdmin.from("winner_verifications").select("status").in("draw_match_id", matchIds);
    assertNoError("verification records", verificationError);
    verificationStatuses.push(...(verificationRows ?? []).map((v) => v.status));
  }

  return summarizeWinners(matches, payoutByMatchId, verificationStatuses);
}

export async function getCharityAnalytics(query: CharitiesReportQuery): Promise<CharityAnalyticsReportDTO> {
  let contributionsBuilder = supabaseAdmin.from("charity_contributions").select("charity_id, contribution_cents");
  if (query.from) contributionsBuilder = contributionsBuilder.gte("period_end", query.from);
  if (query.to) contributionsBuilder = contributionsBuilder.lte("period_end", query.to);

  let donationsBuilder = supabaseAdmin.from("independent_donations").select("amount_cents").eq("status", "completed");
  if (query.from) donationsBuilder = donationsBuilder.gte("created_at", query.from);
  if (query.to) donationsBuilder = donationsBuilder.lte("created_at", query.to);

  const [charities, contributions, donations, selections] = await Promise.all([
    supabaseAdmin.from("charities").select("id, name"),
    contributionsBuilder,
    donationsBuilder,
    supabaseAdmin.from("charity_selections").select("charity_id, contribution_percent"),
  ]);

  assertNoError("charities", charities.error);
  assertNoError("charity contributions", contributions.error);
  assertNoError("independent donations", donations.error);
  assertNoError("charity selections", selections.error);

  return summarizeCharityContributions(charities.data ?? [], contributions.data ?? [], donations.data ?? [], selections.data ?? []);
}

export async function getSubscriptionAnalytics(): Promise<SubscriptionAnalyticsReportDTO> {
  const { data, error } = await supabaseAdmin.from("subscriptions").select("status, current_period_end, subscription_plans(code)");
  assertNoError("subscriptions", error);

  const rows = (data ?? []).map((s) => ({
    status: s.status as SubscriptionStatus,
    current_period_end: s.current_period_end,
    planCode: (s.subscription_plans as unknown as { code: "monthly" | "yearly" } | null)?.code ?? null,
  }));

  const bucketed = bucketSubscriptions(rows);
  return {
    totalSubscriptions: bucketed.total,
    activeSubscriptions: bucketed.active,
    canceledSubscriptions: bucketed.canceled,
    lapsedSubscriptions: bucketed.lapsed,
    monthlyPlanCount: bucketed.monthly,
    yearlyPlanCount: bucketed.yearly,
  };
}
