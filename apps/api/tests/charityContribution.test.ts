import { describe, expect, it } from "vitest";
import {
  calculateContributionCents,
  isValidContributionPercent,
  MAX_CHARITY_CONTRIBUTION_PERCENT,
  MIN_CHARITY_CONTRIBUTION_PERCENT,
} from "@digital-heroes/shared";

describe("calculateContributionCents", () => {
  it("calculates the minimum 10% contribution on a $12.00 monthly plan", () => {
    expect(calculateContributionCents(1200, 10)).toBe(120);
  });

  it("calculates a voluntarily higher contribution percentage", () => {
    expect(calculateContributionCents(1200, 15)).toBe(180);
    expect(calculateContributionCents(12000, 25)).toBe(3000);
  });

  it("rounds to the nearest whole cent rather than truncating or using float settlement", () => {
    // 999 * 10 / 100 = 99.9 → rounds to 100
    expect(calculateContributionCents(999, 10)).toBe(100);
    // 1201 * 10 / 100 = 120.1 → rounds to 120
    expect(calculateContributionCents(1201, 10)).toBe(120);
    // 1233 * 33.33 / 100 = 410.9589 → rounds to 411
    expect(calculateContributionCents(1233, 33.33)).toBe(411);
  });

  it("returns 0 for a 0-cent subscription amount without throwing", () => {
    expect(calculateContributionCents(0, 10)).toBe(0);
  });

  it("rejects a negative subscription amount", () => {
    expect(() => calculateContributionCents(-100, 10)).toThrow();
  });

  it("rejects a non-integer subscription amount (must be whole cents)", () => {
    expect(() => calculateContributionCents(12.5, 10)).toThrow();
  });
});

describe("isValidContributionPercent", () => {
  it("accepts the minimum boundary (10%)", () => {
    expect(isValidContributionPercent(MIN_CHARITY_CONTRIBUTION_PERCENT)).toBe(true);
  });

  it("rejects anything below the 10% minimum", () => {
    expect(isValidContributionPercent(9.99)).toBe(false);
    expect(isValidContributionPercent(0)).toBe(false);
  });

  it("accepts a voluntarily higher percentage", () => {
    expect(isValidContributionPercent(15)).toBe(true);
    expect(isValidContributionPercent(50)).toBe(true);
  });

  it("accepts the maximum sanity ceiling (100%) and rejects above it", () => {
    expect(isValidContributionPercent(MAX_CHARITY_CONTRIBUTION_PERCENT)).toBe(true);
    expect(isValidContributionPercent(100.01)).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(isValidContributionPercent("15")).toBe(false);
    expect(isValidContributionPercent(null)).toBe(false);
    expect(isValidContributionPercent(NaN)).toBe(false);
  });
});
