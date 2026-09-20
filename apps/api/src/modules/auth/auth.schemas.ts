import { z } from "zod";

export const signUpSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password is too long.")
    .regex(/[A-Za-z]/, "Password must contain at least one letter.")
    .regex(/[0-9]/, "Password must contain at least one number."),
  fullName: z.string().trim().min(1, "Full name is required.").max(120),
});

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
