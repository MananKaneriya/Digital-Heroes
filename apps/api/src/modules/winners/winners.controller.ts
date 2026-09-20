import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { AppError } from "../../lib/errors.js";
import { rejectProofSchema, winnerIdParamSchema } from "./winners.schemas.js";
import * as winnersService from "./winners.service.js";
import type { AdminListWinnersQuery } from "./winners.service.js";

export const postProof = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = winnerIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid winner id.");
  if (!req.file) throw AppError.validation("A proof image file is required.");

  const verification = await winnersService.uploadProof(
    req.user.id,
    params.data.id,
    { buffer: req.file.buffer, mimetype: req.file.mimetype, size: req.file.size, originalname: req.file.originalname },
    req.requestId,
  );
  res.status(201).json({ success: true, data: verification });
});

export const getWinner = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = winnerIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid winner id.");

  const detail = await winnersService.getWinnerDetail(params.data.id, req.user.id, req.user.role);
  res.json({ success: true, data: detail });
});

export const adminGetWinner = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = winnerIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid winner id.");

  const detail = await winnersService.getWinnerDetail(params.data.id, req.user.id, req.user.role);
  res.json({ success: true, data: detail });
});

export const adminListWinnersHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const query: AdminListWinnersQuery = { page, pageSize };
  if (typeof req.query.verificationStatus === "string") query.verificationStatus = req.query.verificationStatus as AdminListWinnersQuery["verificationStatus"];
  if (typeof req.query.payoutStatus === "string") query.payoutStatus = req.query.payoutStatus as AdminListWinnersQuery["payoutStatus"];
  if (typeof req.query.tier === "string") query.tier = Number(req.query.tier) as AdminListWinnersQuery["tier"];
  if (typeof req.query.drawId === "string") query.drawId = req.query.drawId;

  const { winners, total } = await winnersService.adminListWinners(query);
  res.json({ success: true, data: { winners, total, page, pageSize } });
});

export const postApproveWinner = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = winnerIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid winner id.");

  await winnersService.approveWinner(req.user.id, params.data.id, req.requestId);
  res.json({ success: true, data: { message: "Winner approved." } });
});

export const postRejectWinner = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = winnerIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid winner id.");
  const parsed = rejectProofSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("A rejection reason is required.", parsed.error.flatten().fieldErrors);

  await winnersService.rejectWinner(req.user.id, params.data.id, parsed.data.reason, req.requestId);
  res.json({ success: true, data: { message: "Winner proof rejected." } });
});
