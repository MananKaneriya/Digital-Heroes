import { describe, expect, it } from "vitest";
import { devStripeProvider, completeMockCheckout } from "../src/modules/subscriptions/stripe.provider.dev.js";
import { AppError } from "../src/lib/errors.js";

describe("dev-mock Stripe adapter", () => {
  it("creates a checkout session pointing at the app's own /dev-checkout page", async () => {
    const result = await devStripeProvider.createCheckoutSession({
      userId: "user-1",
      email: "user@example.com",
      planCode: "monthly",
      priceCents: 1200,
      currency: "usd",
      stripeCustomerId: "cus_mock_user-1",
      successUrl: "http://localhost:5173/dashboard",
      cancelUrl: "http://localhost:5173/pricing",
    });

    expect(result.url).toContain("/dev-checkout?session=");
    expect(result.sessionId).toMatch(/^cs_mock_/);
  });

  it("resolves a pending session into a checkout.session.completed event exactly once", async () => {
    const { sessionId } = await devStripeProvider.createCheckoutSession({
      userId: "user-2",
      email: "user2@example.com",
      planCode: "yearly",
      priceCents: 12000,
      currency: "usd",
      stripeCustomerId: "cus_mock_user-2",
      successUrl: "http://localhost:5173/dashboard",
      cancelUrl: "http://localhost:5173/pricing",
    });

    const event = completeMockCheckout(sessionId);
    expect(event.type).toBe("checkout.session.completed");
    expect(event.data.object.client_reference_id).toBe("user-2");
    expect((event.data.object.metadata as Record<string, string>).planCode).toBe("yearly");

    // A second completion of the same (now-consumed) session must fail rather than
    // silently create a duplicate subscription.
    expect(() => completeMockCheckout(sessionId)).toThrowError(expect.objectContaining({ code: expect.stringContaining("NOT_FOUND") }));
  });

  it("rejects completion of an unknown session id", () => {
    try {
      completeMockCheckout("cs_mock_does-not-exist");
      expect.fail("expected completeMockCheckout to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(404);
    }
  });
});
