import { z } from "zod";

export const createDonationSchema = z.object({
  charityId: z.string().uuid("Choose a valid charity."),
  amountCents: z
    .number({ required_error: "A donation amount is required." })
    .int("Amount must be a whole number of cents.")
    .min(100, "The minimum donation is $1.00.")
    .max(100_000_00, "The maximum single donation is $100,000.00."),
});

export type CreateDonationBody = z.infer<typeof createDonationSchema>;
