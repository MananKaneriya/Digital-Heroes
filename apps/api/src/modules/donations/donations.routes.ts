import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getMyDonations, postDevCompleteDonationCheckout, postDonationCheckout } from "./donations.controller.js";

/**
 * Independent donations require only authentication, not an active
 * subscription — they are explicitly independent of gameplay/subscription
 * status (PRD §7).
 */
export const donationsRouter = Router();

donationsRouter.post("/checkout", requireAuth, postDonationCheckout);
donationsRouter.get("/me", requireAuth, getMyDonations);
donationsRouter.post("/dev/complete-checkout", postDevCompleteDonationCheckout);
