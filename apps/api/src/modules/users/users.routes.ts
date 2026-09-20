import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { getUsers, patchMe } from "./users.controller.js";

export const usersRouter = Router();

usersRouter.get("/", requireAuth, requireRole("admin"), getUsers);
usersRouter.patch("/me", requireAuth, patchMe);
