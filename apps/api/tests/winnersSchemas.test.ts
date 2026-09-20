import { describe, expect, it } from "vitest";
import { rejectProofSchema, winnerIdParamSchema } from "../src/modules/winners/winners.schemas.js";

describe("winnerIdParamSchema", () => {
  it("accepts a valid uuid", () => {
    expect(winnerIdParamSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111" }).success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(winnerIdParamSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});

describe("rejectProofSchema", () => {
  it("accepts a non-empty reason", () => {
    expect(rejectProofSchema.safeParse({ reason: "Screenshot does not show the score clearly." }).success).toBe(true);
  });

  it("rejects an empty reason", () => {
    expect(rejectProofSchema.safeParse({ reason: "" }).success).toBe(false);
  });

  it("rejects a missing reason", () => {
    expect(rejectProofSchema.safeParse({}).success).toBe(false);
  });
});
