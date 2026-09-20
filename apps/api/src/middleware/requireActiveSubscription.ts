import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { AppError } from "../lib/errors.js";
import { hasActiveAccess } from "../modules/subscriptions/subscriptions.service.js";

/**
 * Re-validates subscription status against the database on every protected
 * request rather than trusting anything the client claims (PRD §5.3/§5.4).
 * Admins are exempt — subscription gating applies to subscriber-only features.
 */
export const requireActiveSubscription = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw AppError.unauthorized();
  if (req.user.role === "admin") return next();

  const active = await hasActiveAccess(req.user.id);
  if (!active) throw AppError.subscriptionRequired();
  next();
});
