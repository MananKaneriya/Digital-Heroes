import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { AppError } from "../../lib/errors.js";
import { categoryLogger } from "../../lib/logger.js";
import {
  cancelSubscriptionSchema,
  devCompleteCheckoutSchema,
  startCheckoutSchema,
} from "./subscriptions.schemas.js";
import * as subscriptionsService from "./subscriptions.service.js";
import * as donationsService from "../donations/donations.service.js";

const webhookLog = categoryLogger("webhook");

export const getPlans = asyncHandler(async (_req: Request, res: Response) => {
  const plans = await subscriptionsService.listPlans();
  res.json({ success: true, data: plans });
});

export const getMySubscription = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const subscription = await subscriptionsService.getMySubscription(req.user.id);
  res.json({ success: true, data: subscription });
});

export const postCheckout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const parsed = startCheckoutSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please choose a valid plan.", parsed.error.flatten().fieldErrors);

  const result = await subscriptionsService.startCheckout(req.user.id, req.user.email, parsed.data.planCode);
  res.json({ success: true, data: result });
});

export const postDevCompleteCheckout = asyncHandler(async (req: Request, res: Response) => {
  const parsed = devCompleteCheckoutSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("A sessionId is required.", parsed.error.flatten().fieldErrors);

  const subscription = await subscriptionsService.devCompleteCheckout(parsed.data.sessionId);
  res.json({ success: true, data: subscription });
});

export const postCancel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const parsed = cancelSubscriptionSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw AppError.validation("Invalid request.", parsed.error.flatten().fieldErrors);

  const subscription = await subscriptionsService.cancelSubscription(req.user.id, req.user.role, parsed.data.immediately);
  res.json({ success: true, data: subscription });
});

/**
 * Every checkout-based payment (subscriptions and independent donations alike)
 * lands on this one Stripe webhook endpoint. Donation-mode sessions are tagged
 * with `metadata.kind === "donation"` at creation time (see
 * subscriptions/stripe.provider.real.ts and donations.service.ts) so they can
 * be routed to the donations module instead of being misinterpreted as a
 * subscription event — both paths share the same payment_events idempotency
 * ledger via paymentEvents.service.ts, so a session can never be double-claimed.
 */
export const postWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string | undefined;
  let event;
  try {
    event = subscriptionsService.verifyAndParseWebhook(req.body as Buffer, signature);
  } catch (err) {
    webhookLog.warn({ err }, "webhook signature verification failed");
    throw AppError.validation("Invalid webhook signature.");
  }

  const object = event.data.object as Record<string, unknown>;
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const isDonationEvent = event.type === "checkout.session.completed" && metadata.kind === "donation";

  if (isDonationEvent) {
    await donationsService.processDonationEvent(event);
  } else {
    await subscriptionsService.processProviderEvent(event);
  }
  res.json({ received: true });
});
