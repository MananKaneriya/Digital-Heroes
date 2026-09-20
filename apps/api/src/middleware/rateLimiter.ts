import rateLimit from "express-rate-limit";
import { ErrorCodes } from "@digital-heroes/shared";

function jsonRateLimitHandler(message: string) {
  return (_req: unknown, res: import("express").Response) => {
    res.status(429).json({ success: false, error: { code: ErrorCodes.RATE_LIMITED, message } });
  };
}

/** Strict limiter for authentication endpoints (PRD §4: rate limiting + brute-force protection). */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("Too many authentication attempts. Please try again in 15 minutes."),
});

/** General-purpose limiter applied to the whole API as a floor against abuse. */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler("Too many requests. Please slow down."),
});
