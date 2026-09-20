import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, "Enter a valid calendar date.");

const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(20);

export const drawsReportQuerySchema = z.object({
  // Defaults to published-only: a simulated/draft draw's winner and prize
  // figures are only a candidate result, never a finalized financial fact
  // (Phase E: "simulation is not publication"). Pass status=all (or a
  // specific status) to see the rest of the pipeline.
  status: z.enum(["draft", "simulated", "published", "all"]).default("published"),
  drawId: z.string().uuid("Invalid draw id.").optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const winnersReportQuerySchema = z.object({
  drawId: z.string().uuid("Invalid draw id.").optional(),
  tier: z.coerce.number().int().refine((v) => v === 3 || v === 4 || v === 5, "Tier must be 3, 4, or 5.").optional(),
  verificationStatus: z.enum(["pending", "submitted", "approved", "rejected"]).optional(),
  payoutStatus: z.enum(["pending", "paid", "failed"]).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const charitiesReportQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export type DrawsReportQuery = z.infer<typeof drawsReportQuerySchema>;
export type WinnersReportQuery = z.infer<typeof winnersReportQuerySchema>;
export type CharitiesReportQuery = z.infer<typeof charitiesReportQuerySchema>;
