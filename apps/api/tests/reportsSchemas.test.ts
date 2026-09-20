import { describe, expect, it } from "vitest";
import { charitiesReportQuerySchema, drawsReportQuerySchema, winnersReportQuerySchema } from "../src/modules/reports/reports.schemas.js";

describe("drawsReportQuerySchema", () => {
  it("defaults status to published, page to 1, and pageSize to 20 when omitted", () => {
    const result = drawsReportQuerySchema.parse({});
    expect(result).toEqual({ status: "published", page: 1, pageSize: 20 });
  });

  it("accepts an explicit status of all/draft/simulated/published", () => {
    for (const status of ["all", "draft", "simulated", "published"]) {
      expect(drawsReportQuerySchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects an invalid status value", () => {
    expect(drawsReportQuerySchema.safeParse({ status: "finished" }).success).toBe(false);
  });

  it("rejects a non-uuid drawId", () => {
    expect(drawsReportQuerySchema.safeParse({ drawId: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts a valid from/to date range", () => {
    const result = drawsReportQuerySchema.safeParse({ from: "2026-01-01", to: "2026-12-31" });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(drawsReportQuerySchema.safeParse({ from: "01/01/2026" }).success).toBe(false);
  });

  it("rejects a calendar-invalid date", () => {
    expect(drawsReportQuerySchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
  });

  it("rejects page below 1", () => {
    expect(drawsReportQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("rejects a pageSize above the maximum", () => {
    expect(drawsReportQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });

  it("rejects a non-numeric page", () => {
    expect(drawsReportQuerySchema.safeParse({ page: "abc" }).success).toBe(false);
  });

  it("coerces numeric strings from query params", () => {
    const result = drawsReportQuerySchema.parse({ page: "2", pageSize: "10" });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });
});

describe("winnersReportQuerySchema", () => {
  it("accepts tier 3, 4, or 5", () => {
    for (const tier of ["3", "4", "5"]) {
      expect(winnersReportQuerySchema.safeParse({ tier }).success).toBe(true);
    }
  });

  it("rejects an out-of-range tier", () => {
    expect(winnersReportQuerySchema.safeParse({ tier: "2" }).success).toBe(false);
    expect(winnersReportQuerySchema.safeParse({ tier: "6" }).success).toBe(false);
  });

  it("accepts a valid verificationStatus", () => {
    expect(winnersReportQuerySchema.safeParse({ verificationStatus: "approved" }).success).toBe(true);
  });

  it("rejects an invalid verificationStatus", () => {
    expect(winnersReportQuerySchema.safeParse({ verificationStatus: "unknown" }).success).toBe(false);
  });

  it("accepts a valid payoutStatus", () => {
    expect(winnersReportQuerySchema.safeParse({ payoutStatus: "paid" }).success).toBe(true);
  });

  it("rejects an invalid payoutStatus", () => {
    expect(winnersReportQuerySchema.safeParse({ payoutStatus: "refunded" }).success).toBe(false);
  });

  it("rejects a non-uuid drawId", () => {
    expect(winnersReportQuerySchema.safeParse({ drawId: "123" }).success).toBe(false);
  });

  it("accepts no filters at all (everything optional)", () => {
    expect(winnersReportQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe("charitiesReportQuerySchema", () => {
  it("accepts an empty query", () => {
    expect(charitiesReportQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a valid date range", () => {
    expect(charitiesReportQuerySchema.safeParse({ from: "2026-01-01", to: "2026-06-30" }).success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(charitiesReportQuerySchema.safeParse({ from: "not-a-date" }).success).toBe(false);
  });
});
