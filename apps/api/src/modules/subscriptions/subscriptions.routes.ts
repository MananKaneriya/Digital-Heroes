import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import {
  getMySubscription,
  getPlans,
  postCancel,
  postCheckout,
  postDevCompleteCheckout,
} from "./subscriptions.controller.js";

/**
 * NOTE: the `/webhook` route is mounted separately in app.ts with raw-body
 * parsing (required for Stripe signature verification), before the global
 * JSON body parser. It is not defined in this router.
 */
export const subscriptionsRouter = Router();

subscriptionsRouter.get("/plans", getPlans);
subscriptionsRouter.get("/me", requireAuth, getMySubscription);
subscriptionsRouter.post("/checkout", requireAuth, postCheckout);
subscriptionsRouter.post("/cancel", requireAuth, postCancel);
subscriptionsRouter.post("/dev/complete-checkout", postDevCompleteCheckout);
