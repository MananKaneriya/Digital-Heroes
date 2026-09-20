import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
