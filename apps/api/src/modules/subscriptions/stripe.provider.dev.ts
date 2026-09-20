import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type {
  CheckoutParams,
  CheckoutResult,
  DonationCheckoutParams,
  ProviderEvent,
  SubscriptionProvider,
} from "./stripe.provider.js";

/**
 * ==========================================================================
 * DEVELOPMENT MOCK STRIPE ADAPTER — DO NOT USE IN PRODUCTION
 * ==========================================================================
 * Activated automatically whenever STRIPE_SECRET_KEY is not a real Stripe key
 * (see stripe.provider.ts). It simulates the subscription checkout lifecycle
 * entirely in-process so the full signup → subscribe → access flow can be
 * exercised end-to-end without a Stripe account, per the requirement that
 * unavailable external providers get a clearly labelled dev adapter rather
 * than a fake/disconnected flow.
 *
 * Instead of redirecting to Stripe-hosted checkout, `createCheckoutSession`
 * returns a URL to a page in our own frontend (/dev-checkout) that explains
 * this is a simulation and lets the user "complete" the mock payment, which
 * calls POST /api/subscriptions/dev/complete-checkout. That route resolves
 * the pending session below and feeds a synthetic `checkout.session.completed`
 * event through the exact same webhook-processing code path a real Stripe
 * webhook would use — so business logic is never duplicated between the real
 * and mock providers.
 */

interface PendingSession {
  userId: string;
  email: string;
  planCode: CheckoutParams["planCode"];
  stripeCustomerId: string;
}

const pendingSessions = new Map<string, PendingSession>();

interface PendingDonationSession {
  userId: string;
  charityId: string;
  amountCents: number;
}

const pendingDonationSessions = new Map<string, PendingDonationSession>();

export const devStripeProvider: SubscriptionProvider = {
  name: "dev-mock",

  async getOrCreateCustomer(userId, _email, existingCustomerId) {
    return existingCustomerId ?? `cus_mock_${userId}`;
  },

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const sessionId = `cs_mock_${randomUUID()}`;
    pendingSessions.set(sessionId, {
      userId: params.userId,
      email: params.email,
      planCode: params.planCode,
      stripeCustomerId: params.stripeCustomerId,
    });
    return { url: `${env.APP_URL}/dev-checkout?session=${sessionId}`, sessionId };
  },

  async createDonationCheckoutSession(params: DonationCheckoutParams): Promise<CheckoutResult> {
    const sessionId = `cs_mock_donation_${randomUUID()}`;
    pendingDonationSessions.set(sessionId, {
      userId: params.userId,
      charityId: params.charityId,
      amountCents: params.amountCents,
    });
    return { url: `${env.APP_URL}/dev-checkout?session=${sessionId}&kind=donation`, sessionId };
  },

  constructWebhookEvent(): ProviderEvent {
    throw AppError.internal("The dev-mock Stripe adapter does not receive real webhooks.");
  },

  async cancelSubscription(): Promise<void> {
    // No external provider state to cancel in dev mode; the caller updates the DB row directly.
  },
};

/** Resolves a pending mock checkout session into a synthetic `checkout.session.completed` event. */
export function completeMockCheckout(sessionId: string): ProviderEvent {
  const pending = pendingSessions.get(sessionId);
  if (!pending) throw AppError.notFound("This mock checkout session was not found or was already completed.");
  pendingSessions.delete(sessionId);

  const mockSubscriptionId = `sub_mock_${randomUUID()}`;
  return {
    id: `evt_mock_${randomUUID()}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        customer: pending.stripeCustomerId,
        subscription: mockSubscriptionId,
        client_reference_id: pending.userId,
        metadata: { userId: pending.userId, planCode: pending.planCode },
      },
    },
  };
}

/** Resolves a pending mock donation checkout session into a synthetic `checkout.session.completed` event. */
export function completeMockDonationCheckout(sessionId: string): ProviderEvent {
  const pending = pendingDonationSessions.get(sessionId);
  if (!pending) throw AppError.notFound("This mock checkout session was not found or was already completed.");
  pendingDonationSessions.delete(sessionId);

  return {
    id: `evt_mock_${randomUUID()}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        client_reference_id: pending.userId,
        metadata: { kind: "donation", userId: pending.userId, charityId: pending.charityId },
      },
    },
  };
}
