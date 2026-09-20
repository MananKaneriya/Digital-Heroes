import { z } from "zod";

export const simulateDrawSchema = z.object({
  month: z
    .string({ required_error: "A draw month is required." })
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format."),
  prizePoolCents: z
    .number({ required_error: "A prize pool amount is required." })
    .int("Prize pool must be a whole number of cents.")
    .positive("Prize pool must be greater than zero."),
  seed: z.number().int().positive().optional(),
});

export const drawIdParamSchema = z.object({ id: z.string().uuid("Invalid draw id.") });

export const payoutIdParamSchema = z.object({ payoutId: z.string().uuid("Invalid payout id.") });

export const updatePayoutStatusSchema = z.object({
  status: z.enum(["paid", "failed"], { required_error: "A payout status is required." }),
  method: z.string().trim().min(1).max(100).optional(),
});

export type SimulateDrawBody = z.infer<typeof simulateDrawSchema>;
export type UpdatePayoutStatusBody = z.infer<typeof updatePayoutStatusSchema>;
