import { z } from "zod";
import { MAX_CHARITY_CONTRIBUTION_PERCENT, MIN_CHARITY_CONTRIBUTION_PERCENT } from "@digital-heroes/shared";

export const listCharitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(200).optional(),
  hasUpcomingEvents: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export const charityIdParamSchema = z.object({ id: z.string().uuid("Invalid charity id.") });

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only.");

export const createCharitySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  slug: slugSchema,
  shortDescription: z.string().trim().max(300).default(""),
  fullDescription: z.string().trim().max(10000).default(""),
});

export const updateCharitySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  shortDescription: z.string().trim().max(300).optional(),
  fullDescription: z.string().trim().max(10000).optional(),
  isActive: z.boolean().optional(),
});

export const setFeaturedSchema = z.object({
  charityId: z.string().uuid().nullable(),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(5000).default(""),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format."),
  location: z.string().trim().max(300).optional(),
});

export const updateEventSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
    .optional(),
  location: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
});

export const eventIdParamSchema = z.object({ eventId: z.string().uuid("Invalid event id.") });

export const selectCharitySchema = z.object({
  charityId: z.string().uuid("Choose a valid charity."),
  contributionPercent: z
    .number({ required_error: "A contribution percentage is required." })
    .min(MIN_CHARITY_CONTRIBUTION_PERCENT, `Contribution must be at least ${MIN_CHARITY_CONTRIBUTION_PERCENT}%.`)
    .max(MAX_CHARITY_CONTRIBUTION_PERCENT, `Contribution cannot exceed ${MAX_CHARITY_CONTRIBUTION_PERCENT}%.`),
});
