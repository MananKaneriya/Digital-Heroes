import { describe, expect, it } from "vitest";
import {
  allocatePrizes,
  countMatches,
  generateWinningNumbers,
  getCalendarMonthBounds,
  mulberry32,
  tierForMatchCount,
} from "../src/modules/draws/drawEngine.js";

describe("getCalendarMonthBounds", () => {
  it("returns the first and last calendar day of the given month", () => {
    expect(getCalendarMonthBounds("2026-10")).toEqual({ periodStart: "2026-10-01", periodEnd: "2026-10-31" });
  });

  it("handles a 28-day February correctly", () => {
    expect(getCalendarMonthBounds("2026-02")).toEqual({ periodStart: "2026-02-01", periodEnd: "2026-02-28" });
  });

  it("handles a leap-year February correctly", () => {
    expect(getCalendarMonthBounds("2028-02")).toEqual({ periodStart: "2028-02-01", periodEnd: "2028-02-29" });
  });

  it("rejects a malformed month string", () => {
    expect(() => getCalendarMonthBounds("2026-1")).toThrow();
    expect(() => getCalendarMonthBounds("not-a-month")).toThrow();
  });
});

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});

describe("generateWinningNumbers", () => {
  const participantNumbers = [
    [1, 2, 3, 4, 5],
    [10, 20, 30, 40, 45],
    [1, 1, 1, 1, 1],
  ];

  it("always returns exactly `count` unique numbers within [min, max]", () => {
    const numbers = generateWinningNumbers({ participantNumbers, min: 1, max: 45, count: 5, seed: 7 });
    expect(numbers).toHaveLength(5);
    expect(new Set(numbers).size).toBe(5);
    for (const n of numbers) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(45);
    }
  });

  it("is reproducible from the same seed and inputs (auditability)", () => {
    const first = generateWinningNumbers({ participantNumbers, min: 1, max: 45, count: 5, seed: 123 });
    const second = generateWinningNumbers({ participantNumbers, min: 1, max: 45, count: 5, seed: 123 });
    expect(second).toEqual(first);
  });

  it("can still draw a number nobody scored this period (Laplace smoothing)", () => {
    // Every participant only ever scored within 1-5; a number like 44 has zero
    // observed frequency but must still be a possible draw outcome.
    const narrow = [
      [1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5],
    ];
    let sawUnobservedNumber = false;
    for (let seed = 1; seed <= 200 && !sawUnobservedNumber; seed++) {
      const numbers = generateWinningNumbers({ participantNumbers: narrow, min: 1, max: 45, count: 5, seed });
      if (numbers.some((n) => n > 5)) sawUnobservedNumber = true;
    }
    expect(sawUnobservedNumber).toBe(true);
  });

  it("works with zero eligible participants (empty frequency table)", () => {
    const numbers = generateWinningNumbers({ participantNumbers: [], min: 1, max: 45, count: 5, seed: 9 });
    expect(numbers).toHaveLength(5);
    expect(new Set(numbers).size).toBe(5);
  });
});

describe("countMatches", () => {
  it("counts order-independent set overlap", () => {
    expect(countMatches([5, 12, 20, 33, 41], [41, 20, 5, 1, 2])).toBe(3);
  });

  it("treats a participant's numbers as a unique set, not a multiset", () => {
    // Duplicate participant values can never inflate the match count beyond
    // the number of distinct winning numbers they actually hold.
    expect(countMatches([7, 7, 7, 7, 7], [7, 8, 9, 10, 11])).toBe(1);
  });

  it("returns 0 for no overlap", () => {
    expect(countMatches([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])).toBe(0);
  });
});

describe("tierForMatchCount", () => {
  it.each([
    [5, 5],
    [4, 4],
    [3, 3],
    [2, null],
    [1, null],
    [0, null],
  ])("maps %i matches to tier %o", (matchCount, expected) => {
    expect(tierForMatchCount(matchCount)).toBe(expected);
  });
});

describe("allocatePrizes", () => {
  it("splits the pool 40/35/25 across tiers with single winners", () => {
    const result = allocatePrizes({
      prizePoolCents: 100_000,
      jackpotRolloverCents: 0,
      entries: [
        { userId: "five", matchCount: 5 },
        { userId: "four", matchCount: 4 },
        { userId: "three", matchCount: 3 },
        { userId: "none", matchCount: 1 },
      ],
    });

    const byTier = Object.fromEntries(result.tiers.map((t) => [t.tier, t]));
    expect(byTier[5].allocationCents).toBe(40_000);
    expect(byTier[5].winners).toEqual([{ userId: "five", prizeCents: 40_000 }]);
    expect(byTier[4].allocationCents).toBe(35_000);
    expect(byTier[4].winners).toEqual([{ userId: "four", prizeCents: 35_000 }]);
    expect(byTier[3].allocationCents).toBe(25_000);
    expect(byTier[3].winners).toEqual([{ userId: "three", prizeCents: 25_000 }]);
    expect(result.jackpotCarriedForwardCents).toBe(0);
  });

  it("splits a tier equally among multiple winners, distributing rounding remainder deterministically", () => {
    const result = allocatePrizes({
      prizePoolCents: 100, // 5-tier allocation = round(100 * 0.40) = 40 cents
      jackpotRolloverCents: 0,
      entries: [
        { userId: "a", matchCount: 5 },
        { userId: "b", matchCount: 5 },
        { userId: "c", matchCount: 5 },
      ],
    });

    const fiveTier = result.tiers.find((t) => t.tier === 5)!;
    expect(fiveTier.allocationCents).toBe(40);
    // 40 / 3 = 13 remainder 1 -> one winner gets 14, the rest get 13; total must equal the allocation exactly.
    const total = fiveTier.winners.reduce((sum, w) => sum + w.prizeCents, 0);
    expect(total).toBe(40);
    expect(fiveTier.winners.map((w) => w.prizeCents).sort()).toEqual([13, 13, 14]);
  });

  it("rolls the entire 5-match allocation into the jackpot when there are no 5-match winners", () => {
    const result = allocatePrizes({
      prizePoolCents: 100_000,
      jackpotRolloverCents: 0,
      entries: [{ userId: "four", matchCount: 4 }],
    });

    const fiveTier = result.tiers.find((t) => t.tier === 5)!;
    expect(fiveTier.winners).toEqual([]);
    expect(result.jackpotCarriedForwardCents).toBe(40_000);
  });

  it("adds an incoming jackpot rollover on top of this draw's own 5-match allocation", () => {
    const result = allocatePrizes({
      prizePoolCents: 100_000,
      jackpotRolloverCents: 40_000, // rolled over from a prior no-winner 5-match tier
      entries: [{ userId: "winner", matchCount: 5 }],
    });

    const fiveTier = result.tiers.find((t) => t.tier === 5)!;
    expect(fiveTier.allocationCents).toBe(80_000); // 40_000 (this draw's 40%) + 40_000 rollover
    expect(fiveTier.winners).toEqual([{ userId: "winner", prizeCents: 80_000 }]);
    expect(result.jackpotCarriedForwardCents).toBe(0);
  });

  it("does not roll over a 4-match or 3-match tier with no winners (assessment assumption: only 5-match rolls over)", () => {
    const result = allocatePrizes({
      prizePoolCents: 100_000,
      jackpotRolloverCents: 0,
      entries: [{ userId: "five", matchCount: 5 }],
    });

    const fourTier = result.tiers.find((t) => t.tier === 4)!;
    const threeTier = result.tiers.find((t) => t.tier === 3)!;
    expect(fourTier.winners).toEqual([]);
    expect(threeTier.winners).toEqual([]);
    expect(result.jackpotCarriedForwardCents).toBe(0); // 5-match tier had a winner, so nothing rolls over
  });
});
