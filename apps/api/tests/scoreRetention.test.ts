import { describe, expect, it } from "vitest";
import { selectRetainedScoreIds } from "../src/modules/scores/scoreRetention.js";

describe("selectRetainedScoreIds", () => {
  it("retains every score when there are fewer than the maximum", () => {
    const scores = [
      { id: "a", scoreDate: "2026-09-01" },
      { id: "b", scoreDate: "2026-09-05" },
      { id: "c", scoreDate: "2026-09-10" },
    ];
    const result = selectRetainedScoreIds(scores, 5);
    expect(result.removedIds).toEqual([]);
    expect(new Set(result.retainedIds)).toEqual(new Set(["a", "b", "c"]));
  });

  it("retains exactly five scores and removes none when there are exactly five", () => {
    const scores = [
      { id: "1", scoreDate: "2026-09-01" },
      { id: "2", scoreDate: "2026-09-04" },
      { id: "3", scoreDate: "2026-09-08" },
      { id: "4", scoreDate: "2026-09-12" },
      { id: "5", scoreDate: "2026-09-16" },
    ];
    const result = selectRetainedScoreIds(scores, 5);
    expect(result.removedIds).toEqual([]);
    expect(new Set(result.retainedIds)).toEqual(new Set(["1", "2", "3", "4", "5"]));
  });

  it("removes exactly the oldest score by date when a sixth is added", () => {
    const scores = [
      { id: "1", scoreDate: "2026-09-01" }, // oldest — must be removed
      { id: "2", scoreDate: "2026-09-04" },
      { id: "3", scoreDate: "2026-09-08" },
      { id: "4", scoreDate: "2026-09-12" },
      { id: "5", scoreDate: "2026-09-16" },
      { id: "6", scoreDate: "2026-09-20" }, // newly added
    ];
    const result = selectRetainedScoreIds(scores, 5);
    expect(result.removedIds).toEqual(["1"]);
    expect(new Set(result.retainedIds)).toEqual(new Set(["2", "3", "4", "5", "6"]));
  });

  it("ranks strictly by score_date, never by array/insertion order (proxy for created_at)", () => {
    // Deliberately shuffled so array order does not match chronological order —
    // the oldest score_date (2026-09-01) must still be the one removed.
    const shuffled = [
      { id: "6", scoreDate: "2026-09-20" },
      { id: "1", scoreDate: "2026-09-01" },
      { id: "4", scoreDate: "2026-09-12" },
      { id: "2", scoreDate: "2026-09-04" },
      { id: "5", scoreDate: "2026-09-16" },
      { id: "3", scoreDate: "2026-09-08" },
    ];
    const result = selectRetainedScoreIds(shuffled, 5);
    expect(result.removedIds).toEqual(["1"]);
    expect(new Set(result.retainedIds)).toEqual(new Set(["2", "3", "4", "5", "6"]));
  });

  it("correctly recalculates the retained set for an out-of-order edit that back-dates a score", () => {
    // Matches the PRD's own worked example: an edit assigns 2026-09-07, which is
    // newer than 09-01 (now the oldest) but older than several other retained dates.
    const scores = [
      { id: "a", scoreDate: "2026-09-01" },
      { id: "b", scoreDate: "2026-09-05" },
      { id: "c", scoreDate: "2026-09-07" }, // edited into this position
      { id: "d", scoreDate: "2026-09-10" },
      { id: "e", scoreDate: "2026-09-15" },
      { id: "f", scoreDate: "2026-09-20" },
    ];
    const result = selectRetainedScoreIds(scores, 5);
    expect(result.removedIds).toEqual(["a"]);
    expect(new Set(result.retainedIds)).toEqual(new Set(["b", "c", "d", "e", "f"]));
  });

  it("removes multiple overflow scores when far more than the maximum exist", () => {
    const scores = Array.from({ length: 8 }, (_, i) => ({
      id: `id-${i}`,
      scoreDate: `2026-09-${String(i + 1).padStart(2, "0")}`,
    }));
    const result = selectRetainedScoreIds(scores, 5);
    expect(result.removedIds.sort()).toEqual(["id-0", "id-1", "id-2"].sort());
    expect(result.retainedIds).toHaveLength(5);
  });
});
