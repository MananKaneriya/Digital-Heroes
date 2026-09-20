import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { AppError } from "../../lib/errors.js";
import { drawIdParamSchema, payoutIdParamSchema, simulateDrawSchema, updatePayoutStatusSchema } from "./draws.schemas.js";
import * as drawsService from "./draws.service.js";

// ---- Public ----------------------------------------------------------------

export const listDrawsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const draws = await drawsService.listPublishedDraws();
  res.json({ success: true, data: draws });
});

export const getDraw = asyncHandler(async (req: Request, res: Response) => {
  const params = drawIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid draw id.");

  const result = await drawsService.getPublishedDrawWithTiers(params.data.id);
  res.json({ success: true, data: result });
});

// ---- Subscriber own results -------------------------------------------------

export const getMyResults = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const results = await drawsService.getMyDrawResults(req.user.id);
  res.json({ success: true, data: results });
});

// ---- Admin ----------------------------------------------------------

export const adminListDrawsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const draws = await drawsService.adminListDraws();
  res.json({ success: true, data: draws });
});

export const adminGetDraw = asyncHandler(async (req: Request, res: Response) => {
  const params = drawIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid draw id.");

  const result = await drawsService.adminGetDrawDetail(params.data.id);
  res.json({ success: true, data: result });
});

export const postSimulateDraw = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const parsed = simulateDrawSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check the draw parameters.", parsed.error.flatten().fieldErrors);

  const draw = await drawsService.simulateDraw(req.user.id, parsed.data, req.requestId);
  res.json({ success: true, data: draw });
});

export const postPublishDraw = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = drawIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid draw id.");

  const draw = await drawsService.publishDraw(req.user.id, params.data.id, req.requestId);
  res.json({ success: true, data: draw });
});

export const patchPayoutStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = payoutIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid payout id.");
  const parsed = updatePayoutStatusSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check the payout status.", parsed.error.flatten().fieldErrors);

  await drawsService.updatePayoutStatus(req.user.id, params.data.payoutId, parsed.data.status, req.requestId, parsed.data.method);
  res.json({ success: true, data: { message: "Payout status updated." } });
});
