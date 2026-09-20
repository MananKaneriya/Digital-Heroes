import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { adminGetWinner, adminListWinnersHandler, getWinner, postApproveWinner, postProof, postRejectWinner } from "./winners.controller.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * Mounted at /api/winners, mirroring the existing charities/draws modules'
 * convention of nesting admin routes under the same router (/api/winners/admin/...)
 * rather than the prompt's suggested top-level /api/admin/winners — kept
 * consistent with how every other module in this project is already organized.
 *
 * "GET /api/winners/me" from the Phase F brief is deliberately NOT duplicated
 * here: the existing GET /api/draws/me already returns every one of a
 * subscriber's draw results, and was extended (not replaced) with
 * verificationStatus/rejectionReason — see draws.service.ts's
 * getMyDrawResults. Adding a second endpoint that re-queries the same rows
 * would be exactly the "second source of truth" the brief says to avoid.
 */
export const winnersRouter = Router();

// ---- Admin (registered before the /:id wildcard below) ----
winnersRouter.get("/admin", requireAuth, requireRole("admin"), adminListWinnersHandler);
winnersRouter.get("/admin/:id", requireAuth, requireRole("admin"), adminGetWinner);
winnersRouter.post("/admin/:id/verify", requireAuth, requireRole("admin"), postApproveWinner);
winnersRouter.post("/admin/:id/reject", requireAuth, requireRole("admin"), postRejectWinner);

// ---- Winner (own record only — enforced in the service layer) ----
winnersRouter.post("/:id/proof", requireAuth, upload.single("file"), postProof);
winnersRouter.get("/:id", requireAuth, getWinner);
