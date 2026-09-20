import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
const recordAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: { from: fromMock },
}));

vi.mock("../src/modules/audit/audit.service.js", () => ({
  recordAudit: recordAuditMock,
}));

import { createDonationCheckout, processDonationEvent } from "../src/modules/donations/donations.service.js";
import type { ProviderEvent } from "../src/modules/subscriptions/stripe.provider.js";

function chainable(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "update", "insert"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  fromMock.mockReset();
  recordAuditMock.mockClear();
});

describe("createDonationCheckout", () => {
  it("rejects a nonexistent charity", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: null, error: null }));

    await expect(createDonationCheckout("user-1", "user@example.com", { charityId: "charity-x", amountCents: 2500 })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects an inactive charity", async () => {
    fromMock.mockReturnValueOnce(
      chainable({ data: { id: "charity-1", name: "Ocean Renewal", slug: "ocean-renewal", is_active: false }, error: null }),
    );

    await expect(createDonationCheckout("user-1", "user@example.com", { charityId: "charity-1", amountCents: 2500 })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("creates a pending donation record via the dev-mock provider (no Stripe key configured in tests)", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { id: "charity-1", name: "Ocean Renewal", slug: "ocean-renewal", is_active: true }, error: null }))
      .mockReturnValueOnce(chainable({ error: null })); // independent_donations insert

    const result = await createDonationCheckout("user-1", "user@example.com", { charityId: "charity-1", amountCents: 2500 });

    expect(result.provider).toBe("dev-mock");
    expect(result.url).toContain("/dev-checkout");
    expect(result.url).toContain("kind=donation");
  });
});

describe("processDonationEvent", () => {
  const donationEvent: ProviderEvent = {
    id: "evt_test_1",
    type: "checkout.session.completed",
    data: { object: { id: "cs_mock_donation_1", client_reference_id: "user-1", metadata: { kind: "donation", userId: "user-1", charityId: "charity-1" } } },
  };

  it("marks the donation completed and audits it on first delivery", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ error: null })) // claimPaymentEvent insert succeeds
      .mockReturnValueOnce(chainable({ data: { id: "donation-1", user_id: "user-1", charity_id: "charity-1", amount_cents: 2500 }, error: null })) // update -> completed
      .mockReturnValueOnce(chainable({ error: null })); // markPaymentEventProcessed update

    await processDonationEvent(donationEvent);

    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "donation.completed", entityId: "donation-1" }));
  });

  it("ignores a duplicate delivery of the same event without double-marking or double-auditing", async () => {
    fromMock.mockReturnValueOnce(chainable({ error: { code: "23505", message: "duplicate key" } })); // claimPaymentEvent: already claimed

    await processDonationEvent(donationEvent);

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });
});
