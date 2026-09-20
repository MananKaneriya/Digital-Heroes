import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { AppError } from "../../lib/errors.js";
import { stripeIsConfigured } from "../../config/env.js";
import { completeMockDonationCheckout } from "../subscriptions/stripe.provider.dev.js";
import { createDonationSchema } from "./donations.schemas.js";
import * as donationsService from "./donations.service.js";

export const postDonationCheckout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const parsed = createDonationSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check the donation amount.", parsed.error.flatten().fieldErrors);

  const result = await donationsService.createDonationCheckout(req.user.id, req.user.email, parsed.data);
  res.json({ success: true, data: result });
});

export const postDevCompleteDonationCheckout = asyncHandler(async (req: Request, res: Response) => {
  if (stripeIsConfigured) throw AppError.forbidden("The dev checkout completion endpoint is disabled when real Stripe keys are configured.");
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : undefined;
  if (!sessionId) throw AppError.validation("A sessionId is required.");

  const event = completeMockDonationCheckout(sessionId);
  await donationsService.processDonationEvent(event);
  res.json({ success: true, data: { message: "Donation completed." } });
});

export const getMyDonations = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const donations = await donationsService.listMyDonations(req.user.id);
  res.json({ success: true, data: donations });
});
