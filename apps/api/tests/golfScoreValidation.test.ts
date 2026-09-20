import { describe, expect, it } from "vitest";
import { isValidStablefordScore, STABLEFORD_SCORE_MAX, STABLEFORD_SCORE_MIN } from "@digital-heroes/shared";
import { createScoreSchema, updateScoreSchema } from "../src/modules/scores/scores.schemas.js";

describe("isValidStablefordScore", () => {
  it("accepts the minimum boundary value (1)", () => {
    expect(isValidStablefordScore(STABLEFORD_SCORE_MIN)).toBe(true);
  });

  it("accepts the maximum boundary value (45)", () => {
    expect(isValidStablefordScore(STABLEFORD_SCORE_MAX)).toBe(true);
  });

  it("rejects 0", () => {
    expect(isValidStablefordScore(0)).toBe(false);
  });

  it("rejects 46", () => {
    expect(isValidStablefordScore(46)).toBe(false);
  });

  it("rejects negative values", () => {
    expect(isValidStablefordScore(-5)).toBe(false);
  });

  it("rejects non-integer (decimal) values", () => {
    expect(isValidStablefordScore(32.5)).toBe(false);
  });

  it("rejects non-numeric values", () => {
    expect(isValidStablefordScore("37")).toBe(false);
    expect(isValidStablefordScore(null)).toBe(false);
    expect(isValidStablefordScore(undefined)).toBe(false);
  });
});

describe("createScoreSchema", () => {
  it("accepts a valid score and date", () => {
    const result = createScoreSchema.safeParse({ score: 37, scoreDate: "2026-09-20" });
    expect(result.success).toBe(true);
  });

  it("rejects a score of 0", () => {
    expect(createScoreSchema.safeParse({ score: 0, scoreDate: "2026-09-20" }).success).toBe(false);
  });

  it("rejects a score of 46", () => {
    expect(createScoreSchema.safeParse({ score: 46, scoreDate: "2026-09-20" }).success).toBe(false);
  });

  it("rejects a decimal score", () => {
    expect(createScoreSchema.safeParse({ score: 32.5, scoreDate: "2026-09-20" }).success).toBe(false);
  });

  it("rejects a missing date", () => {
    expect(createScoreSchema.safeParse({ score: 30 }).success).toBe(false);
  });

  it("rejects a malformed date string", () => {
    expect(createScoreSchema.safeParse({ score: 30, scoreDate: "20-09-2026" }).success).toBe(false);
  });

  it("rejects a calendar-invalid date (Feb 30)", () => {
    expect(createScoreSchema.safeParse({ score: 30, scoreDate: "2026-02-30" }).success).toBe(false);
  });
});

describe("updateScoreSchema", () => {
  it("accepts a partial update with only a score", () => {
    expect(updateScoreSchema.safeParse({ score: 40 }).success).toBe(true);
  });

  it("accepts a partial update with only a date", () => {
    expect(updateScoreSchema.safeParse({ scoreDate: "2026-09-21" }).success).toBe(true);
  });

  it("rejects an update with neither field", () => {
    expect(updateScoreSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an out-of-range score in an update", () => {
    expect(updateScoreSchema.safeParse({ score: 100 }).success).toBe(false);
  });
});
