import { Router } from "express";
import { authRateLimiter } from "../../middleware/rateLimiter.js";
import { requireAuth } from "../../middleware/auth.js";
import { getMe, postRefresh, postSignIn, postSignOut, postSignUp } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/signup", authRateLimiter, postSignUp);
authRouter.post("/login", authRateLimiter, postSignIn);
authRouter.post("/refresh", authRateLimiter, postRefresh);
authRouter.post("/logout", requireAuth, postSignOut);
authRouter.get("/me", requireAuth, getMe);
