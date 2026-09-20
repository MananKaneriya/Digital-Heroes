import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { deleteScoreHandler, getScores, patchScore, postScore } from "./scores.controller.js";

/**
 * Mounted at /api/scores (not /api/v1/scores) to stay consistent with the rest of
 * the API, none of which is version-prefixed (/api/auth, /api/users,
 * /api/subscriptions) — see PHASE C completion report for this decision.
 */
export const scoresRouter = Router();

// Score tracking is a subscriber feature: reuses the existing auth + subscription-status
// middleware rather than duplicating access-control logic (PRD §14). Admins are exempt
// from the subscription check by that same middleware, matching every other module.
scoresRouter.use(requireAuth, requireActiveSubscription);

scoresRouter.get("/", getScores);
scoresRouter.post("/", postScore);
scoresRouter.patch("/:id", patchScore);
scoresRouter.delete("/:id", deleteScoreHandler);
