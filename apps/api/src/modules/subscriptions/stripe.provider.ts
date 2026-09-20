import type { PlanCode } from "@digital-heroes/shared";
import { stripeIsConfigured } from "../../config/env.js";
import { realStripeProvider } from "./stripe.provider.real.js";
import { devStripeProvider } from "./stripe.provider.dev.js";
import { categoryLogger } from "../../lib/logger.js";

export interface CheckoutParams {
  userId: string;
  email: string;
  planCode: PlanCode;
  priceCents: number;
  currency: string;
  stripeCustomerId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
}

/** A one-off (non-recurring) payment — used by independent donations (PRD §7), never subscriptions. */
export interface DonationCheckoutParams {
  userId: string;
  email: string;
  charityId: string;
  charityName: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

/** A provider-agnostic shape mirroring the fields of a Stripe webhook event that our handler needs. */
export interface ProviderEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export interface SubscriptionProvider {
  readonly name: "stripe" | "dev-mock";
  getOrCreateCustomer(userId: string, email: string, existingCustomerId: string | null): Promise<string>;
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;
  /** One-time "payment" mode checkout, distinct from the recurring "subscription" mode above. */
  createDonationCheckoutSession(params: DonationCheckoutParams): Promise<CheckoutResult>;
  constructWebhookEvent(rawBody: Buffer, signature: string | undefined): ProviderEvent;
  cancelSubscription(stripeSubscriptionId: string, atPeriodEnd: boolean): Promise<void>;
}

const log = categoryLogger("app");

export const subscriptionProvider: SubscriptionProvider = stripeIsConfigured ? realStripeProvider : devStripeProvider;

if (!stripeIsConfigured) {
  log.warn(
    "STRIPE_SECRET_KEY is not set — using the DEVELOPMENT MOCK Stripe adapter. " +
      "No real payments will occur. Set STRIPE_SECRET_KEY/STRIPE_PUBLISHABLE_KEY/STRIPE_WEBHOOK_SECRET " +
      "in apps/api/.env to exercise real Stripe test mode.",
  );
}
