import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { AppError } from "../../lib/errors.js";
import {
  charityIdParamSchema,
  createCharitySchema,
  createEventSchema,
  eventIdParamSchema,
  listCharitiesQuerySchema,
  selectCharitySchema,
  setFeaturedSchema,
  updateCharitySchema,
  updateEventSchema,
} from "./charities.schemas.js";
import * as charitiesService from "./charities.service.js";

// ---- Public ----------------------------------------------------------------

export const getCharities = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listCharitiesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw AppError.validation("Invalid query parameters.", parsed.error.flatten().fieldErrors);

  const { charities, total } = await charitiesService.listCharities({ ...parsed.data, includeInactive: false });
  res.json({ success: true, data: { charities, total, page: parsed.data.page, pageSize: parsed.data.pageSize } });
});

export const getCharityProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await charitiesService.getCharityProfile(req.params.idOrSlug, false);
  res.json({ success: true, data: profile });
});

export const getCharityEvents = asyncHandler(async (req: Request, res: Response) => {
  const events = await charitiesService.listCharityEvents(req.params.idOrSlug, false);
  res.json({ success: true, data: events });
});

export const getFeaturedCharity = asyncHandler(async (_req: Request, res: Response) => {
  const charity = await charitiesService.getFeaturedCharity();
  res.json({ success: true, data: charity });
});

// ---- Subscriber selection ----------------------------------------------------------

export const getMySelection = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const selection = await charitiesService.getMySelection(req.user.id);
  res.json({ success: true, data: selection });
});

export const putMySelection = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const parsed = selectCharitySchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check your charity and contribution percentage.", parsed.error.flatten().fieldErrors);

  const selection = await charitiesService.selectCharity(req.user.id, parsed.data, req.requestId);
  res.json({ success: true, data: selection });
});

export const getMyContributions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const contributions = await charitiesService.listMyContributions(req.user.id);
  res.json({ success: true, data: contributions });
});

// ---- Admin ----------------------------------------------------------

export const adminGetCharities = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listCharitiesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw AppError.validation("Invalid query parameters.", parsed.error.flatten().fieldErrors);

  const { charities, total } = await charitiesService.adminListCharities(parsed.data);
  res.json({ success: true, data: { charities, total, page: parsed.data.page, pageSize: parsed.data.pageSize } });
});

export const postCharity = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const parsed = createCharitySchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check the charity details.", parsed.error.flatten().fieldErrors);

  const charity = await charitiesService.createCharity(req.user.id, parsed.data, req.requestId);
  res.status(201).json({ success: true, data: charity });
});

export const patchCharity = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = charityIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid charity id.");
  const parsed = updateCharitySchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check the charity details.", parsed.error.flatten().fieldErrors);

  const charity = await charitiesService.updateCharity(req.user.id, params.data.id, parsed.data, req.requestId);
  res.json({ success: true, data: charity });
});

export const putFeaturedCharity = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const parsed = setFeaturedSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Invalid request.", parsed.error.flatten().fieldErrors);

  await charitiesService.setFeaturedCharity(req.user.id, parsed.data.charityId, req.requestId);
  res.json({ success: true, data: { message: "Featured charity updated." } });
});

export const postEvent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = charityIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid charity id.");
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check the event details.", parsed.error.flatten().fieldErrors);

  const event = await charitiesService.createEvent(req.user.id, params.data.id, parsed.data, req.requestId);
  res.status(201).json({ success: true, data: event });
});

export const patchEvent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = eventIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid event id.");
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.validation("Please check the event details.", parsed.error.flatten().fieldErrors);

  const event = await charitiesService.updateEvent(req.user.id, params.data.eventId, parsed.data, req.requestId);
  res.json({ success: true, data: event });
});

export const deleteEventHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = eventIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid event id.");

  await charitiesService.deleteEvent(req.user.id, params.data.eventId, req.requestId);
  res.json({ success: true, data: { message: "Event deleted." } });
});

export const postMedia = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const params = charityIdParamSchema.safeParse(req.params);
  if (!params.success) throw AppError.validation("Invalid charity id.");
  if (!req.file) throw AppError.validation("An image file is required.");

  const media = await charitiesService.uploadCharityMedia(
    req.user.id,
    params.data.id,
    { buffer: req.file.buffer, mimetype: req.file.mimetype, size: req.file.size, originalname: req.file.originalname },
    typeof req.body?.altText === "string" ? req.body.altText : undefined,
    req.requestId,
  );
  res.status(201).json({ success: true, data: media });
});

export const deleteMediaHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const mediaId = req.params.mediaId;
  if (!mediaId) throw AppError.validation("Invalid image id.");

  await charitiesService.deleteCharityMedia(req.user.id, mediaId, req.requestId);
  res.json({ success: true, data: { message: "Image deleted." } });
});
