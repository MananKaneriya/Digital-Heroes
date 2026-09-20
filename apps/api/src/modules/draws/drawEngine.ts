import type { MatchTier } from "@digital-heroes/shared";
import { TIER_ALLOCATION_PERCENT } from "@digital-heroes/shared";

/** Assessment assumption: the RNG method name recorded on every draw for audit purposes. */
export const RNG_METHOD = "frequency-weighted-without-replacement-v1";

/**
 * Deterministic seeded PRNG (mulberry32). Given the same seed it always produces
 * the same sequence, which is what makes a simulated draw reproducible/auditable
 * from the stored seed alone — the frequency table itself is always re-derivable
 * from the frozen draw_entries.numbers snapshot, so only the seed needs storing.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getCalendarMonthBounds(month: string): { periodStart: string; periodEnd: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`Invalid month "${month}"; expected YYYY-MM.`);
  const year = Number(match[1]);
  const monthNum = Number(match[2]);
  const start = new Date(Date.UTC(year, monthNum - 1, 1));
  const end = new Date(Date.UTC(year, monthNum, 0)); // day 0 of next month = last day of this month
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: fmt(start), periodEnd: fmt(end) };
}

/**
 * Assessment assumption (req. 4): weight each candidate number by how often it
 * appears across every eligible participant's frozen number set this period,
 * plus 1 (Laplace smoothing) so a number nobody scored this month is still
 * possible to draw rather than permanently excluded.
 */
export function buildFrequencyTable(participantNumbers: number[][], min: number, max: number): Map<number, number> {
  const freq = new Map<number, number>();
  for (let n = min; n <= max; n++) freq.set(n, 0);
  for (const numbers of participantNumbers) {
    for (const n of numbers) {
      if (n >= min && n <= max) freq.set(n, (freq.get(n) ?? 0) + 1);
    }
  }
  return freq;
}

/** Weighted sampling without replacement — O(count * candidates), trivial for a 45-number range. */
export function pickWeightedWithoutReplacement(candidates: number[], weights: number[], count: number, rng: () => number): number[] {
  const pool = candidates.map((value, i) => ({ value, weight: weights[i] }));
  const picked: number[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((sum, c) => sum + c.weight, 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    picked.push(pool[idx].value);
    pool.splice(idx, 1);
  }
  return picked;
}

export function generateWinningNumbers(params: {
  participantNumbers: number[][];
  min: number;
  max: number;
  count: number;
  seed: number;
}): number[] {
  const freq = buildFrequencyTable(params.participantNumbers, params.min, params.max);
  const candidates: number[] = [];
  const weights: number[] = [];
  for (let n = params.min; n <= params.max; n++) {
    candidates.push(n);
    weights.push((freq.get(n) ?? 0) + 1);
  }
  const rng = mulberry32(params.seed);
  const picked = pickWeightedWithoutReplacement(candidates, weights, params.count, rng);
  return picked.sort((a, b) => a - b);
}

/** Order-independent set match, per assumption 3 ("treat the participant's numbers as a unique set"). */
export function countMatches(participantNumbers: number[], winningNumbers: number[]): number {
  const participantSet = new Set(participantNumbers);
  let count = 0;
  for (const n of new Set(winningNumbers)) {
    if (participantSet.has(n)) count++;
  }
  return count;
}

export function tierForMatchCount(matchCount: number): MatchTier | null {
  if (matchCount === 5) return 5;
  if (matchCount === 4) return 4;
  if (matchCount === 3) return 3;
  return null;
}

export interface DrawEntryMatch {
  userId: string;
  matchCount: number;
}

export interface TierAllocation {
  tier: MatchTier;
  allocationCents: number;
  winners: { userId: string; prizeCents: number }[];
}

export interface AllocationResult {
  tiers: TierAllocation[];
  /** The 5-match tier's full allocation, carried to next draw's jackpot rollover-in when nobody hit 5 (req. 6/8). */
  jackpotCarriedForwardCents: number;
}

/**
 * Splits the prize pool 40/35/25 across the 5/4/3 tiers, then divides each
 * tier's allocation equally among that tier's winners. Any leftover cent from
 * integer division (allocation not evenly divisible by winner count) is handed
 * out one cent at a time to winners in a deterministic (sorted userId) order,
 * so the full allocation is always paid out with no cents lost to rounding.
 *
 * Assessment assumption: a 4- or 3-match tier with zero winners is simply not
 * paid out this draw — only the 5-match tier rolls forward (req. 6/8 name only
 * a 5-match rollover; nothing else is invented here).
 */
export function allocatePrizes(params: {
  prizePoolCents: number;
  jackpotRolloverCents: number;
  entries: DrawEntryMatch[];
}): AllocationResult {
  const fiveAllocation = Math.round((params.prizePoolCents * TIER_ALLOCATION_PERCENT[5]) / 100) + params.jackpotRolloverCents;
  const fourAllocation = Math.round((params.prizePoolCents * TIER_ALLOCATION_PERCENT[4]) / 100);
  const threeAllocation = Math.round((params.prizePoolCents * TIER_ALLOCATION_PERCENT[3]) / 100);
  const allocationByTier: Record<MatchTier, number> = { 5: fiveAllocation, 4: fourAllocation, 3: threeAllocation };

  const tiers: TierAllocation[] = [];
  let jackpotCarriedForwardCents = 0;

  for (const tier of [5, 4, 3] as const) {
    const allocationCents = allocationByTier[tier];
    const winnerIds = params.entries
      .filter((e) => e.matchCount === tier)
      .map((e) => e.userId)
      .sort();

    if (winnerIds.length === 0) {
      tiers.push({ tier, allocationCents, winners: [] });
      if (tier === 5) jackpotCarriedForwardCents = allocationCents;
      continue;
    }

    const base = Math.floor(allocationCents / winnerIds.length);
    let remainder = allocationCents - base * winnerIds.length;
    const winners = winnerIds.map((userId) => {
      const bonus = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      return { userId, prizeCents: base + bonus };
    });

    tiers.push({ tier, allocationCents, winners });
  }

  return { tiers, jackpotCarriedForwardCents };
}
