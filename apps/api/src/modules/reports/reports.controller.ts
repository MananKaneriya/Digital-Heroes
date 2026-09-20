import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { AppError } from "../../lib/errors.js";
import { charitiesReportQuerySchema, drawsReportQuerySchema, winnersReportQuerySchema } from "./reports.schemas.js";
import * as reportsService from "./reports.service.js";

export const getOverview = asyncHandler(async (_req: Request, res: Response) => {
  const overview = await reportsService.getOverviewReport();
  res.json({ success: true, data: overview });
});

export const getDrawReport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = drawsReportQuerySchema.safeParse(req.query);
  if (!parsed.success) throw AppError.validation("Invalid report filters.", parsed.error.flatten().fieldErrors);

  const result = await reportsService.getDrawAnalytics(parsed.data);
  res.json({ success: true, data: result });
});

export const getWinnerReport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = winnersReportQuerySchema.safeParse(req.query);
  if (!parsed.success) throw AppError.validation("Invalid report filters.", parsed.error.flatten().fieldErrors);

  const report = await reportsService.getWinnerAnalytics(parsed.data);
  res.json({ success: true, data: report });
});

export const getCharityReport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = charitiesReportQuerySchema.safeParse(req.query);
  if (!parsed.success) throw AppError.validation("Invalid report filters.", parsed.error.flatten().fieldErrors);

  const report = await reportsService.getCharityAnalytics(parsed.data);
  res.json({ success: true, data: report });
});

export const getSubscriptionReport = asyncHandler(async (_req: Request, res: Response) => {
  const report = await reportsService.getSubscriptionAnalytics();
  res.json({ success: true, data: report });
});
