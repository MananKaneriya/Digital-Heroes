import { describe, expect, it } from "vitest";
import {
  createCharitySchema,
  createEventSchema,
  selectCharitySchema,
} from "../src/modules/charities/charities.schemas.js";
import { createDonationSchema } from "../src/modules/donations/donations.schemas.js";

describe("createCharitySchema", () => {
  it("accepts a valid charity", () => {
    expect(
      createCharitySchema.safeParse({ name: "Bright Path Fund", slug: "bright-path-fund", shortDescription: "x", fullDescription: "y" })
        .success,
    ).toBe(true);
  });

  it("rejects an uppercase or spaced slug", () => {
    expect(createCharitySchema.safeParse({ name: "X", slug: "Bright Path", shortDescription: "", fullDescription: "" }).success).toBe(false);
    expect(createCharitySchema.safeParse({ name: "X", slug: "Bright_Path", shortDescription: "", fullDescription: "" }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(createCharitySchema.safeParse({ slug: "x" }).success).toBe(false);
  });
});

describe("selectCharitySchema", () => {
  it("accepts the 10% minimum", () => {
    expect(selectCharitySchema.safeParse({ charityId: "11111111-1111-1111-1111-111111111111", contributionPercent: 10 }).success).toBe(true);
  });

  it("rejects below the 10% minimum", () => {
    expect(selectCharitySchema.safeParse({ charityId: "11111111-1111-1111-1111-111111111111", contributionPercent: 9.5 }).success).toBe(false);
  });

  it("accepts a voluntarily higher percentage, including fractional", () => {
    expect(selectCharitySchema.safeParse({ charityId: "11111111-1111-1111-1111-111111111111", contributionPercent: 12.5 }).success).toBe(true);
  });

  it("rejects above the 100% ceiling", () => {
    expect(selectCharitySchema.safeParse({ charityId: "11111111-1111-1111-1111-111111111111", contributionPercent: 150 }).success).toBe(false);
  });

  it("rejects an invalid charity id", () => {
    expect(selectCharitySchema.safeParse({ charityId: "not-a-uuid", contributionPercent: 10 }).success).toBe(false);
  });
});

describe("createEventSchema", () => {
  it("accepts a valid event", () => {
    expect(createEventSchema.safeParse({ title: "Golf Day", eventDate: "2026-10-01" }).success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(createEventSchema.safeParse({ title: "Golf Day", eventDate: "10/01/2026" }).success).toBe(false);
  });

  it("rejects a missing title", () => {
    expect(createEventSchema.safeParse({ eventDate: "2026-10-01" }).success).toBe(false);
  });
});

describe("createDonationSchema", () => {
  it("accepts a valid donation amount", () => {
    expect(createDonationSchema.safeParse({ charityId: "11111111-1111-1111-1111-111111111111", amountCents: 2500 }).success).toBe(true);
  });

  it("rejects an amount below the $1.00 minimum", () => {
    expect(createDonationSchema.safeParse({ charityId: "11111111-1111-1111-1111-111111111111", amountCents: 50 }).success).toBe(false);
  });

  it("rejects a non-integer amount", () => {
    expect(createDonationSchema.safeParse({ charityId: "11111111-1111-1111-1111-111111111111", amountCents: 25.5 }).success).toBe(false);
  });
});
