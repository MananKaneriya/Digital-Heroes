import { z } from "zod";

export const winnerIdParamSchema = z.object({ id: z.string().uuid("Invalid winner id.") });

export const rejectProofSchema = z.object({
  reason: z.string().trim().min(1, "A rejection reason is required.").max(500),
});
