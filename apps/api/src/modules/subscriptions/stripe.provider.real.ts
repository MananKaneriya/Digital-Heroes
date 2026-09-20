import Stripe from "stripe";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type {
  CheckoutParams,
  CheckoutResult,
  DonationCheckoutParams,
  ProviderEvent,
  SubscriptionProvider,
} from "./stripe.provider.js";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

export const realStripeProvider: SubscriptionProvider = {
  name: "stripe",

  async getOrCreateCustomer(userId, email, existingCustomerId) {
    if (existingCustomerId) return existingCustomerId;
    const customer = await stripe.customers.create({ email, metadata: { userId } });
    return customer.id;
  },

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: params.stripeCustomerId,
      client_reference_id: params.userId,
      line_items: [
        {
          price_data: {
            currency: params.currency,
            unit_amount: params.priceCents,
            recurring: { interval: params.planCode === "yearly" ? "year" : "month" },
            product_data: { name: `Digital Heroes — ${params.planCode === "yearly" ? "Yearly" : "Monthly"} Plan` },
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { userId: params.userId, planCode: params.planCode },
      subscription_data: { metadata: { userId: params.userId, planCode: params.planCode } },
    });

    if (!session.url) throw AppError.payment("Stripe did not return a checkout URL.");
    return { url: session.url, sessionId: session.id };
  },

  async createDonationCheckoutSession(params: DonationCheckoutParams): Promise<CheckoutResult> {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: params.email,
      client_reference_id: params.userId,
      line_items: [
        {
          price_data: {
            currency: params.currency,
            unit_amount: params.amountCents,
            product_data: { name: `Donation to ${params.charityName}` },
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { kind: "donation", userId: params.userId, charityId: params.charityId },
    });

    if (!session.url) throw AppError.payment("Stripe did not return a checkout URL.");
    return { url: session.url, sessionId: session.id };
  },

  constructWebhookEvent(rawBody: Buffer, signature: string | undefined): ProviderEvent {
    if (!signature) throw AppError.validation("Missing Stripe signature header.");
    const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    return event as unknown as ProviderEvent;
  },

  async cancelSubscription(stripeSubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    if (atPeriodEnd) {
      await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
    } else {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
    }
  },
};
