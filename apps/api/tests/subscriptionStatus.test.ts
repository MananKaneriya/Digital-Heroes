import { describe, expect, it } from "vitest";
import { effectiveStatus, grantsAccess, mapStripeStatus } from "@digital-heroes/shared";

describe("mapStripeStatus", () => {
  it("maps active and trialing to active", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("trialing")).toBe("active");
  });

  it("maps past_due and unpaid to past_due", () => {
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("unpaid")).toBe("past_due");
  });

  it("maps canceled to canceled", () => {
    expect(mapStripeStatus("canceled")).toBe("canceled");
  });

  it("maps incomplete/incomplete_expired to incomplete", () => {
    expect(mapStripeStatus("incomplete")).toBe("incomplete");
    expect(mapStripeStatus("incomplete_expired")).toBe("incomplete");
  });

  it("falls back to lapsed for any unrecognized status", () => {
    expect(mapStripeStatus("some_future_stripe_status")).toBe("lapsed");
  });
});

describe("grantsAccess", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it("grants access for active status with a future period end", () => {
    expect(grantsAccess("active", future)).toBe(true);
  });

  it("grants access for past_due status while still within the current period", () => {
    expect(grantsAccess("past_due", future)).toBe(true);
  });

  it("denies access once the current period has ended, even if status is still active", () => {
    expect(grantsAccess("active", past)).toBe(false);
  });

  it("denies access for canceled and lapsed regardless of period end", () => {
    expect(grantsAccess("canceled", future)).toBe(false);
    expect(grantsAccess("lapsed", future)).toBe(false);
  });

  it("denies access for incomplete subscriptions", () => {
    expect(grantsAccess("incomplete", future)).toBe(false);
  });

  it("treats a null period end as active-forever only for an active status", () => {
    expect(grantsAccess("active", null)).toBe(true);
    expect(grantsAccess("past_due", null)).toBe(false);
  });
});

describe("effectiveStatus", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it("passes through canceled and incomplete unchanged", () => {
    expect(effectiveStatus("canceled", future)).toBe("canceled");
    expect(effectiveStatus("incomplete", null)).toBe("incomplete");
  });

  it("keeps active when the period has not yet ended", () => {
    expect(effectiveStatus("active", future)).toBe("active");
  });

  it("downgrades a stale active/past_due row to lapsed once the period has ended", () => {
    expect(effectiveStatus("active", past)).toBe("lapsed");
    expect(effectiveStatus("past_due", past)).toBe("lapsed");
  });
});
