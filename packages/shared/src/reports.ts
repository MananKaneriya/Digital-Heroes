/**
 * Phase G — Dashboards, Reporting & Analytics.
 *
 * Every figure here is computed server-side from the existing Phase A–F
 * tables (subscriptions, draws/draw_matches/draw_payouts, charity_selections/
 * charity_contributions/independent_donations, winner_verifications) — no new
 * source of truth is introduced, and subscription-charity-contribution totals
 * are always kept separate from independent-donation totals.
 */
import type { DrawStatus } from "./draw.js";

export interface TierCounts {
  5: number;
  4: number;
  3: number;
}

export interface OverviewReportDTO {
  totalUsers: number;
  activeSubscribers: number;
  totalPrizePoolCents: number;
  totalWinners: number;
  totalPaidCents: number;
  pendingPayoutsCents: number;
  pendingPayoutsCount: number;
  totalCharityContributionsCents: number;
  totalIndependentDonationsCents: number;
  publishedDraws: number;
}

export interface DrawAnalyticsRowDTO {
  drawId: string;
  periodStart: string;
  periodEnd: string;
  status: DrawStatus;
  eligibleParticipants: number;
  prizePoolCents: number;
  jackpotRolloverInCents: number;
  jackpotRolloverOutCents: number;
  winningNumbers: number[] | null;
  winnersByTier: TierCounts;
  totalPrizesCents: number;
  paidCents: number;
  pendingCents: number;
}

export interface DrawsReportResponseDTO {
  draws: DrawAnalyticsRowDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WinnerAnalyticsReportDTO {
  totalWinners: number;
  winnersByTier: TierCounts;
  totalPrizeLiabilityCents: number;
  totalPaidCents: number;
  totalPendingCents: number;
  totalApprovedVerification: number;
  totalRejectedVerification: number;
}

export interface CharityAnalyticsRowDTO {
  charityId: string;
  name: string;
  totalContributionCents: number;
  supporterCount: number;
}

export interface CharityAnalyticsReportDTO {
  /** Subscription-based charity contributions only — never combined with donations below. */
  totalContributionsCents: number;
  /** Independent donations, kept explicitly separate per the Phase D financial-separation rule. */
  totalIndependentDonationsCents: number;
  averageContributionPercent: number;
  byCharity: CharityAnalyticsRowDTO[];
}

export interface SubscriptionAnalyticsReportDTO {
  totalSubscriptions: number;
  activeSubscriptions: number;
  canceledSubscriptions: number;
  lapsedSubscriptions: number;
  monthlyPlanCount: number;
  yearlyPlanCount: number;
}
