import { z } from "zod";
import { STABLEFORD_SCORE_MAX, STABLEFORD_SCORE_MIN } from "@digital-heroes/shared";

const stablefordScoreSchema = z
  .number({ invalid_type_error: "Score must be a number.", required_error: "A Stableford score is required." })
  .int("Score must be a whole number.")
  .min(STABLEFORD_SCORE_MIN, `Score must be at least ${STABLEFORD_SCORE_MIN}.`)
  .max(STABLEFORD_SCORE_MAX, `Score cannot exceed ${STABLEFORD_SCORE_MAX}.`);

const isoDateSchema = z
  .string({ required_error: "A score date is required." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, "Enter a valid calendar date.");

export const createScoreSchema = z.object({
  score: stablefordScoreSchema,
  scoreDate: isoDateSchema,
});

export const updateScoreSchema = z
  .object({
    score: stablefordScoreSchema.optional(),
    scoreDate: isoDateSchema.optional(),
  })
  .refine((data) => data.score !== undefined || data.scoreDate !== undefined, {
    message: "Provide a score or a date to update.",
  });

export const scoreIdParamSchema = z.object({
  id: z.string().uuid("Invalid score id."),
});

export type CreateScoreBody = z.infer<typeof createScoreSchema>;
export type UpdateScoreBody = z.infer<typeof updateScoreSchema>;
