import { effectiveStatus, grantsAccess, type DrawStatus, type SubscriptionStatus, type TierCounts } from "@digital-heroes/shared";

/**
 * Pure aggregation logic for Phase G reporting, kept separate from the
 * Supabase fetching in reports.service.ts (same split used throughout this
 * project — see scoreRetention.ts, drawEngine.ts) so the actual arithmetic is
 * directly unit-testable without mocking a database for every metric.
 */

export interface SubscriptionRowForAnalytics {
  status: SubscriptionStatus;
  current_period_end: string | null;
  planCode: "monthly" | "yearly" | null;
}

/** Reuses the exact grantsAccess/effectiveStatus invariant Phase B already established — never reinvented here. */
export function countActiveSubscribers(rows: { status: SubscriptionStatus; current_period_end: string | null }[]): number {
  return rows.filter((r) => grantsAccess(r.status, r.current_period_end)).length;
}

export function bucketSubscriptions(rows: SubscriptionRowForAnalytics[]): {
  total: number;
  active: number;
  canceled: number;
  lapsed: number;
  monthly: number;
  yearly: number;
} {
  let active = 0;
  let canceled = 0;
  let lapsed = 0;
  let monthly = 0;
  let yearly = 0;

  for (const s of rows) {
    const eff = effectiveStatus(s.status, s.current_period_end);
    if (eff === "active" || eff === "past_due") active++;
    else if (eff === "canceled") canceled++;
    else if (eff === "lapsed") lapsed++;

    if (s.planCode === "monthly") monthly++;
    else if (s.planCode === "yearly") yearly++;
  }

  return { total: rows.length, active, canceled, lapsed, monthly, yearly };
}

export interface MatchForAnalytics {
  id: string;
  tier: 3 | 4 | 5;
  prize_amount_cents: number;
}

export interface PayoutForAnalytics {
  draw_match_id: string;
  status: "pending" | "paid" | "failed";
  amount_cents: number;
}

function emptyTierCounts(): TierCounts {
  return { 5: 0, 4: 0, 3: 0 };
}

function accumulateMatches(matches: MatchForAnalytics[], payoutByMatchId: Map<string, PayoutForAnalytics>) {
  const winnersByTier = emptyTierCounts();
  let totalPrizeCents = 0;
  let paidCents = 0;
  let pendingCents = 0;

  for (const m of matches) {
    winnersByTier[m.tier]++;
    totalPrizeCents += m.prize_amount_cents;
    const payout = payoutByMatchId.get(m.id);
    if (payout?.status === "paid") paidCents += payout.amount_cents;
    if (payout?.status === "pending") pendingCents += payout.amount_cents;
  }

  return { winnersByTier, totalPrizeCents, paidCents, pendingCents };
}

export interface DrawForAnalytics {
  id: string;
  period_start: string;
  period_end: string;
  status: DrawStatus;
  prize_pool_cents: number;
  jackpot_rollover_in_cents: number;
  jackpot_rollover_out_cents: number;
  winning_numbers: number[] | null;
}

/** One row of the admin draw-analytics table — never recalculates winners, only aggregates already-stored results. */
export function buildDrawAnalyticsRow(
  draw: DrawForAnalytics,
  matches: MatchForAnalytics[],
  payoutByMatchId: Map<string, PayoutForAnalytics>,
  eligibleParticipants: number,
) {
  const { winnersByTier, totalPrizeCents, paidCents, pendingCents } = accumulateMatches(matches, payoutByMatchId);
  return {
    drawId: draw.id,
    periodStart: draw.period_start,
    periodEnd: draw.period_end,
    status: draw.status,
    eligibleParticipants,
    prizePoolCents: draw.prize_pool_cents,
    jackpotRolloverInCents: draw.jackpot_rollover_in_cents,
    jackpotRolloverOutCents: draw.jackpot_rollover_out_cents,
    winningNumbers: draw.winning_numbers,
    winnersByTier,
    totalPrizesCents: totalPrizeCents,
    paidCents,
    pendingCents,
  };
}

export function summarizeWinners(
  matches: MatchForAnalytics[],
  payoutByMatchId: Map<string, PayoutForAnalytics>,
  verificationStatuses: string[],
) {
  const { winnersByTier, totalPrizeCents, paidCents, pendingCents } = accumulateMatches(matches, payoutByMatchId);
  return {
    totalWinners: matches.length,
    winnersByTier,
    totalPrizeLiabilityCents: totalPrizeCents,
    totalPaidCents: paidCents,
    totalPendingCents: pendingCents,
    totalApprovedVerification: verificationStatuses.filter((s) => s === "approved").length,
    totalRejectedVerification: verificationStatuses.filter((s) => s === "rejected").length,
  };
}

export interface CharityForAnalytics {
  id: string;
  name: string;
}

export interface ContributionForAnalytics {
  charity_id: string;
  contribution_cents: number;
}

export interface DonationForAnalytics {
  amount_cents: number;
}

export interface SelectionForAnalytics {
  charity_id: string;
  contribution_percent: number;
}

/**
 * Subscription-based contributions and independent donations are summed
 * separately and never merged into one figure — preserving the Phase D
 * financial-separation rule (PRD §7/§19).
 */
export function summarizeCharityContributions(
  charities: CharityForAnalytics[],
  contributions: ContributionForAnalytics[],
  donations: DonationForAnalytics[],
  selections: SelectionForAnalytics[],
) {
  const totalByCharity = new Map<string, number>();
  for (const c of contributions) totalByCharity.set(c.charity_id, (totalByCharity.get(c.charity_id) ?? 0) + c.contribution_cents);

  const supporterCountByCharity = new Map<string, number>();
  for (const s of selections) supporterCountByCharity.set(s.charity_id, (supporterCountByCharity.get(s.charity_id) ?? 0) + 1);

  const byCharity = charities.map((c) => ({
    charityId: c.id,
    name: c.name,
    totalContributionCents: totalByCharity.get(c.id) ?? 0,
    supporterCount: supporterCountByCharity.get(c.id) ?? 0,
  }));

  const totalContributionsCents = contributions.reduce((sum, c) => sum + c.contribution_cents, 0);
  const totalIndependentDonationsCents = donations.reduce((sum, d) => sum + d.amount_cents, 0);
  const averageContributionPercent =
    selections.length > 0 ? selections.reduce((sum, s) => sum + Number(s.contribution_percent), 0) / selections.length : 0;

  return { totalContributionsCents, totalIndependentDonationsCents, averageContributionPercent, byCharity };
}

export function sumCents(rows: Array<Record<string, unknown>> | null | undefined, key: string): number {
  return (rows ?? []).reduce((sum, r) => sum + (Number(r[key]) || 0), 0);
}
