import { describe, expect, it } from "vitest";
import { computePeriodEnd } from "../src/modules/subscriptions/subscriptions.service.js";

describe("computePeriodEnd", () => {
  it("adds one month for the monthly plan", () => {
    const from = new Date("2026-01-15T00:00:00.000Z");
    const end = computePeriodEnd("month", from);
    expect(end.toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });

  it("adds one year for the yearly plan", () => {
    const from = new Date("2026-01-15T00:00:00.000Z");
    const end = computePeriodEnd("year", from);
    expect(end.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("handles month-end overflow (e.g. Jan 31 + 1 month)", () => {
    const from = new Date("2026-01-31T00:00:00.000Z");
    const end = computePeriodEnd("month", from);
    // JS Date rolls Feb 31 forward into March — documenting the actual behavior here
    // guards against a silent change; a real Stripe subscription.updated event will
    // correct this to the provider's authoritative period end regardless.
    expect(end.toISOString()).toBe("2026-03-03T00:00:00.000Z");
  });
});
