import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { getCharityReport, getDrawReport, getOverview, getSubscriptionReport, getWinnerReport } from "./reports.controller.js";

/**
 * Every endpoint in this module is administrator-only, unlike charities/draws/
 * winners (which mix public and admin routes and so nest admin paths under
 * "/admin/..."). Since there is no public or subscriber content here at all,
 * requireAuth + requireRole("admin") is applied once for the whole router
 * rather than repeated per route, and paths stay flat (no "/admin" segment
 * needed to distinguish anything).
 */
export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole("admin"));

reportsRouter.get("/overview", getOverview);
reportsRouter.get("/draws", getDrawReport);
reportsRouter.get("/winners", getWinnerReport);
reportsRouter.get("/charities", getCharityReport);
reportsRouter.get("/subscriptions", getSubscriptionReport);
