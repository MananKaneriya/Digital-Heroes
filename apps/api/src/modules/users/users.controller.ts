import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { AppError } from "../../lib/errors.js";
import { listUsersQuerySchema, updateProfileSchema } from "./users.schemas.js";
import * as usersService from "./users.service.js";

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) throw AppError.validation("Invalid query parameters.", parsed.error.flatten().fieldErrors);

  const { users, total } = await usersService.listUsers(parsed.data);
  res.json({ success: true, data: { users, total, page: parsed.data.page, pageSize: parsed.data.pageSize } });
});

export const patchMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check your details.", parsed.error.flatten().fieldErrors);

  await usersService.updateOwnProfile(req.user.id, req.user.role, parsed.data, req.requestId);
  res.json({ success: true, data: { message: "Profile updated." } });
});
