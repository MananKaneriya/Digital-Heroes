import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import {
  adminGetDraw,
  adminListDrawsHandler,
  getDraw,
  getMyResults,
  listDrawsHandler,
  patchPayoutStatus,
  postPublishDraw,
  postSimulateDraw,
} from "./draws.controller.js";

export const drawsRouter = Router();

// ---- Subscriber's own results (mirrors charities' /me/contributions gating) ----
drawsRouter.get("/me", requireAuth, requireActiveSubscription, getMyResults);

// ---- Admin management (registered before the public "/:id" wildcard below,
// same ordering reason as charities.routes.ts: literal segments first) ----
drawsRouter.get("/admin", requireAuth, requireRole("admin"), adminListDrawsHandler);
drawsRouter.get("/admin/:id", requireAuth, requireRole("admin"), adminGetDraw);
drawsRouter.post("/admin/simulate", requireAuth, requireRole("admin"), postSimulateDraw);
drawsRouter.post("/admin/:id/publish", requireAuth, requireRole("admin"), postPublishDraw);
drawsRouter.patch("/admin/payouts/:payoutId", requireAuth, requireRole("admin"), patchPayoutStatus);

// ---- Public published-draw results (wildcard — must stay last) ----
drawsRouter.get("/", listDrawsHandler);
drawsRouter.get("/:id", getDraw);
