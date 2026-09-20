import { describe, expect, it } from "vitest";
import {
  bucketSubscriptions,
  buildDrawAnalyticsRow,
  countActiveSubscribers,
  summarizeCharityContributions,
  summarizeWinners,
  sumCents,
  type PayoutForAnalytics,
} from "../src/modules/reports/reportsCalculations.js";

const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("countActiveSubscribers", () => {
  it("counts active and past_due (within period) subscribers, reusing the existing grantsAccess rule", () => {
    const count = countActiveSubscribers([
      { status: "active", current_period_end: future },
      { status: "past_due", current_period_end: future },
      { status: "canceled", current_period_end: future },
      { status: "lapsed", current_period_end: future },
      { status: "incomplete", current_period_end: future },
    ]);
    expect(count).toBe(2);
  });

  it("excludes an active row whose period has already ended", () => {
    expect(countActiveSubscribers([{ status: "active", current_period_end: past }])).toBe(0);
  });
});

describe("bucketSubscriptions", () => {
  it("buckets by effective status and plan code independently", () => {
    const result = bucketSubscriptions([
      { status: "active", current_period_end: future, planCode: "monthly" },
      { status: "active", current_period_end: past, planCode: "yearly" }, // effectively lapsed
      { status: "canceled", current_period_end: future, planCode: "monthly" },
      { status: "past_due", current_period_end: future, planCode: "yearly" },
    ]);

    expect(result).toEqual({ total: 4, active: 2, canceled: 1, lapsed: 1, monthly: 2, yearly: 2 });
  });

  it("returns all zeros for an empty subscriber base", () => {
    expect(bucketSubscriptions([])).toEqual({ total: 0, active: 0, canceled: 0, lapsed: 0, monthly: 0, yearly: 0 });
  });
});

describe("buildDrawAnalyticsRow", () => {
  const draw = {
    id: "draw-1",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    status: "published" as const,
    prize_pool_cents: 100_000,
    jackpot_rollover_in_cents: 5_000,
    jackpot_rollover_out_cents: 0,
    winning_numbers: [1, 2, 3, 4, 5],
  };

  it("aggregates winners by tier and payout totals without recalculating the draw itself", () => {
    const matches = [
      { id: "m1", tier: 5 as const, prize_amount_cents: 40_000 },
      { id: "m2", tier: 4 as const, prize_amount_cents: 17_500 },
      { id: "m3", tier: 4 as const, prize_amount_cents: 17_500 },
      { id: "m4", tier: 3 as const, prize_amount_cents: 25_000 },
    ];
    const payoutByMatchId = new Map<string, PayoutForAnalytics>([
      ["m1", { draw_match_id: "m1", status: "paid", amount_cents: 40_000 }],
      ["m2", { draw_match_id: "m2", status: "pending", amount_cents: 17_500 }],
      ["m4", { draw_match_id: "m4", status: "failed", amount_cents: 25_000 }],
    ]);

    const row = buildDrawAnalyticsRow(draw, matches, payoutByMatchId, 42);

    expect(row.eligibleParticipants).toBe(42);
    expect(row.winnersByTier).toEqual({ 5: 1, 4: 2, 3: 1 });
    expect(row.totalPrizesCents).toBe(100_000);
    expect(row.paidCents).toBe(40_000);
    expect(row.pendingCents).toBe(17_500); // failed and unmatched payouts excluded from both paid and pending
  });

  it("handles a draw with zero winners cleanly", () => {
    const row = buildDrawAnalyticsRow(draw, [], new Map(), 10);
    expect(row.winnersByTier).toEqual({ 5: 0, 4: 0, 3: 0 });
    expect(row.totalPrizesCents).toBe(0);
  });
});

describe("summarizeWinners", () => {
  it("summarizes prize liability, payout totals, and verification counts", () => {
    const matches = [
      { id: "m1", tier: 5 as const, prize_amount_cents: 40_000 },
      { id: "m2", tier: 3 as const, prize_amount_cents: 25_000 },
    ];
    const payoutByMatchId = new Map<string, PayoutForAnalytics>([
      ["m1", { draw_match_id: "m1", status: "paid", amount_cents: 40_000 }],
      ["m2", { draw_match_id: "m2", status: "pending", amount_cents: 25_000 }],
    ]);

    const result = summarizeWinners(matches, payoutByMatchId, ["approved", "approved", "rejected", "submitted", "pending"]);

    expect(result.totalWinners).toBe(2);
    expect(result.totalPrizeLiabilityCents).toBe(65_000);
    expect(result.totalPaidCents).toBe(40_000);
    expect(result.totalPendingCents).toBe(25_000);
    expect(result.totalApprovedVerification).toBe(2);
    expect(result.totalRejectedVerification).toBe(1);
  });
});

describe("summarizeCharityContributions", () => {
  it("keeps subscription contributions and independent donations as separate totals", () => {
    const result = summarizeCharityContributions(
      [
        { id: "c1", name: "Bright Path" },
        { id: "c2", name: "Ocean Renewal" },
      ],
      [
        { charity_id: "c1", contribution_cents: 1_200 },
        { charity_id: "c1", contribution_cents: 1_800 },
        { charity_id: "c2", contribution_cents: 500 },
      ],
      [{ amount_cents: 5_000 }, { amount_cents: 2_500 }],
      [
        { charity_id: "c1", contribution_percent: 10 },
        { charity_id: "c1", contribution_percent: 20 },
        { charity_id: "c2", contribution_percent: 15 },
      ],
    );

    expect(result.totalContributionsCents).toBe(3_500);
    expect(result.totalIndependentDonationsCents).toBe(7_500); // never merged with the figure above
    expect(result.averageContributionPercent).toBeCloseTo(15);
    expect(result.byCharity).toEqual(
      expect.arrayContaining([
        { charityId: "c1", name: "Bright Path", totalContributionCents: 3_000, supporterCount: 2 },
        { charityId: "c2", name: "Ocean Renewal", totalContributionCents: 500, supporterCount: 1 },
      ]),
    );
  });

  it("returns zeroed totals when there is no data yet", () => {
    const result = summarizeCharityContributions([], [], [], []);
    expect(result).toEqual({ totalContributionsCents: 0, totalIndependentDonationsCents: 0, averageContributionPercent: 0, byCharity: [] });
  });
});

describe("sumCents", () => {
  it("sums a numeric field across rows", () => {
    expect(sumCents([{ amount_cents: 100 }, { amount_cents: 250 }], "amount_cents")).toBe(350);
  });

  it("treats null/undefined input as zero", () => {
    expect(sumCents(null, "amount_cents")).toBe(0);
    expect(sumCents(undefined, "amount_cents")).toBe(0);
    expect(sumCents([], "amount_cents")).toBe(0);
  });
});
