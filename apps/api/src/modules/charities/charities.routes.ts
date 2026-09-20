import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import {
  adminGetCharities,
  deleteEventHandler,
  deleteMediaHandler,
  getCharities,
  getCharityEvents,
  getCharityProfile,
  getFeaturedCharity,
  getMyContributions,
  getMySelection,
  patchCharity,
  patchEvent,
  postCharity,
  postEvent,
  postMedia,
  putFeaturedCharity,
  putMySelection,
} from "./charities.controller.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const charitiesRouter = Router();

// ---- Public directory (registered before the /:idOrSlug wildcard so literal
// segments like "featured" and "admin" are never swallowed by it) ----
charitiesRouter.get("/", getCharities);
charitiesRouter.get("/featured", getFeaturedCharity);

// ---- Subscriber charity selection (a subscriber feature — see PRD §3.2/§10.1) ----
charitiesRouter.get("/me/selection", requireAuth, requireActiveSubscription, getMySelection);
charitiesRouter.put("/me/selection", requireAuth, requireActiveSubscription, putMySelection);
charitiesRouter.get("/me/contributions", requireAuth, requireActiveSubscription, getMyContributions);

// ---- Admin management ----
charitiesRouter.get("/admin", requireAuth, requireRole("admin"), adminGetCharities);
charitiesRouter.post("/admin", requireAuth, requireRole("admin"), postCharity);
charitiesRouter.patch("/admin/:id", requireAuth, requireRole("admin"), patchCharity);
charitiesRouter.put("/admin/featured", requireAuth, requireRole("admin"), putFeaturedCharity);
charitiesRouter.post("/admin/:id/events", requireAuth, requireRole("admin"), postEvent);
charitiesRouter.patch("/admin/events/:eventId", requireAuth, requireRole("admin"), patchEvent);
charitiesRouter.delete("/admin/events/:eventId", requireAuth, requireRole("admin"), deleteEventHandler);
charitiesRouter.post("/admin/:id/media", requireAuth, requireRole("admin"), upload.single("file"), postMedia);
charitiesRouter.delete("/admin/media/:mediaId", requireAuth, requireRole("admin"), deleteMediaHandler);

// ---- Public profile/events (wildcard — must stay after every literal route above) ----
charitiesRouter.get("/:idOrSlug", getCharityProfile);
charitiesRouter.get("/:idOrSlug/events", getCharityEvents);
