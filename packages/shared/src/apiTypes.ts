import type { Role } from "./roles.js";
import type { SubscriptionStatus } from "./subscriptionStatus.js";
import type { PlanCode } from "./planConfig.js";

/** Consistent API envelope used by every endpoint (PRD §23). */
export type ApiSuccess<T> = { success: true; data: T };
export type ApiError = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface AuthUserDTO {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
}

export interface SubscriptionPlanDTO {
  id: string;
  code: PlanCode;
  name: string;
  billingInterval: "month" | "year";
  priceCents: number;
  currency: string;
  description: string;
  isActive: boolean;
}

export interface SubscriptionDTO {
  id: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}
