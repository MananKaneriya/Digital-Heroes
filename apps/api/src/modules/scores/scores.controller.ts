import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { AppError } from "../../lib/errors.js";
import { createScoreSchema, scoreIdParamSchema, updateScoreSchema } from "./scores.schemas.js";
import * as scoresService from "./scores.service.js";

export const getScores = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const scores = await scoresService.listScores(req.user.id);
  res.json({ success: true, data: scores });
});

export const postScore = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const parsed = createScoreSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check your score and date.", parsed.error.flatten().fieldErrors);

  const scores = await scoresService.createScore(req.user.id, req.user.role, parsed.data, req.requestId);
  res.status(201).json({ success: true, data: scores });
});

export const patchScore = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = scoreIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid score id.");

  const parsed = updateScoreSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check your score and date.", parsed.error.flatten().fieldErrors);

  const scores = await scoresService.updateScore(params.data.id, req.user.id, req.user.role, parsed.data, req.requestId);
  res.json({ success: true, data: scores });
});

export const deleteScoreHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = scoreIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid score id.");

  const scores = await scoresService.deleteScore(params.data.id, req.user.id, req.user.role, req.requestId);
  res.json({ success: true, data: scores });
});
