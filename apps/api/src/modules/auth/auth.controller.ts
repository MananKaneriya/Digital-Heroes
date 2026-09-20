import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { AppError } from "../../lib/errors.js";
import { refreshSchema, signInSchema, signUpSchema } from "./auth.schemas.js";
import * as authService from "./auth.service.js";

function sessionResponse(res: Response, session: authService.AuthSession) {
  res.json({
    success: true,
    data: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      user: session.user,
    },
  });
}

export const postSignUp = asyncHandler(async (req: Request, res: Response) => {
  const parsed = signUpSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check your details.", parsed.error.flatten().fieldErrors);

  const session = await authService.signUp(parsed.data, req.requestId);
  sessionResponse(res, session);
});

export const postSignIn = asyncHandler(async (req: Request, res: Response) => {
  const parsed = signInSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check your details.", parsed.error.flatten().fieldErrors);

  const session = await authService.signIn(parsed.data, req.requestId);
  sessionResponse(res, session);
});

export const postRefresh = asyncHandler(async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("A refreshToken is required.", parsed.error.flatten().fieldErrors);

  const session = await authService.refreshSession(parsed.data.refreshToken);
  sessionResponse(res, session);
});

export const postSignOut = asyncHandler(async (req: Request, res: Response) => {
  if (req.accessToken) await authService.signOut(req.accessToken);
  res.json({ success: true, data: { message: "Signed out." } });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  res.json({ success: true, data: req.user });
});
