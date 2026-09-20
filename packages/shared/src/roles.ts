/**
 * The three product roles from the Digital Heroes PRD (§3).
 * "visitor" is never persisted — it is the implicit role of an unauthenticated request.
 */
export type Role = "subscriber" | "admin";

export const ROLES: readonly Role[] = ["subscriber", "admin"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}
