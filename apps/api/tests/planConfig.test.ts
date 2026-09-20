import { describe, expect, it } from "vitest";
import { formatPrice, MONTHLY_PRICE_CENTS, PLAN_DEFAULTS, YEARLY_PRICE_CENTS } from "@digital-heroes/shared";

describe("plan configuration", () => {
  it("defines exactly a monthly and a yearly plan", () => {
    const codes = PLAN_DEFAULTS.map((p) => p.code).sort();
    expect(codes).toEqual(["monthly", "yearly"]);
  });

  it("prices the yearly plan at a discount vs. 12x the monthly price", () => {
    expect(YEARLY_PRICE_CENTS).toBeLessThan(MONTHLY_PRICE_CENTS * 12);
  });

  it("formats a price in cents as a currency string", () => {
    expect(formatPrice(1200)).toBe("$12.00");
    expect(formatPrice(12000)).toBe("$120.00");
  });
});
