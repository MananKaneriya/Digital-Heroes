import { z } from "zod";

export const planCodeSchema = z.enum(["monthly", "yearly"]);

export const startCheckoutSchema = z.object({
  planCode: planCodeSchema,
});

export const devCompleteCheckoutSchema = z.object({
  sessionId: z.string().min(1),
});

export const cancelSubscriptionSchema = z.object({
  immediately: z.boolean().optional().default(false),
});

export type StartCheckoutInput = z.infer<typeof startCheckoutSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
