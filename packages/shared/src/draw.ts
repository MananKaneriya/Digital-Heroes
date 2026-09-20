/**
 * Phase E — Monthly Draw (assessment implementation).
 *
 * There is no authoritative Phase E product specification in this repository
 * (unlike Phases A–D, which reference numbered "PRD §N" sections throughout).
 * Every rule below that isn't a direct extension of Phase A–D data is an
 * explicit, documented assessment assumption — see the Phase E implementation
 * report for the full list. Nothing here should be read as inferred product
 * policy beyond what's written.
 */
import { MAX_RETAINED_SCORES, STABLEFORD_SCORE_MAX, STABLEFORD_SCORE_MIN } from "./golfScore.js";

/**
 * Assumption: a participant's 5 retained Stableford scores (see golfScore.ts)
 * are their 5 draw numbers, reusing the exact same count and 1–45 range —
 * not a separately generated number set.
 */
export const DRAW_NUMBERS_COUNT = MAX_RETAINED_SCORES; // 5
export const DRAW_NUMBER_MIN = STABLEFORD_SCORE_MIN; // 1
export const DRAW_NUMBER_MAX = STABLEFORD_SCORE_MAX; // 45

export type MatchTier = 5 | 4 | 3;
export const MATCH_TIERS: readonly MatchTier[] = [5, 4, 3];

/** Assumption: fixed allocation percentages as specified for this assessment, not a configurable business rule. */
export const TIER_ALLOCATION_PERCENT: Record<MatchTier, number> = { 5: 40, 4: 35, 3: 25 };

export type DrawStatus = "draft" | "simulated" | "published";
export type DrawPayoutStatus = "pending" | "paid" | "failed";

export function isValidDrawNumberSet(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== DRAW_NUMBERS_COUNT) return false;
  return value.every((n) => typeof n === "number" && Number.isInteger(n) && n >= DRAW_NUMBER_MIN && n <= DRAW_NUMBER_MAX);
}

export interface DrawDTO {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: DrawStatus;
  prizePoolCents: number;
  jackpotRolloverInCents: number;
  jackpotRolloverOutCents: number;
  winningNumbers: number[] | null;
  rngMethod: string | null;
  rngSeed: string | null;
  simulatedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface DrawTierSummaryDTO {
  tier: MatchTier;
  allocationCents: number;
  winnerCount: number;
  totalPaidCents: number;
}

export interface DrawMyResultDTO {
  drawId: string;
  periodStart: string;
  periodEnd: string;
  numbers: number[];
  winningNumbers: number[];
  matchCount: number;
  tier: MatchTier | null;
  prizeAmountCents: number;
  payoutStatus: DrawPayoutStatus | null;
}

export interface DrawAdminMatchDTO {
  userId: string;
  fullName: string | null;
  email: string;
  matchCount: number;
  tier: MatchTier | null;
  prizeAmountCents: number;
  /** null for non-winning matches — no draw_payouts row is ever created for those. */
  payoutId: string | null;
  payoutStatus: DrawPayoutStatus | null;
}

export interface SimulateDrawInput {
  month: string; // "YYYY-MM"
  prizePoolCents: number;
  seed?: number;
}
