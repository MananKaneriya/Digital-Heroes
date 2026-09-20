import { ErrorCodes, type ErrorCode } from "@digital-heroes/shared";

/**
 * A known, expected application error. Anything else thrown is treated as an
 * unexpected internal error and never leaks its message/stack to the client
 * (PRD §18, §23 — never expose stack traces or internal details).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static validation(message: string, details?: unknown) {
    return new AppError(ErrorCodes.VALIDATION_ERROR, message, 400, details);
  }
  static unauthorized(message = "Authentication required.") {
    return new AppError(ErrorCodes.UNAUTHORIZED, message, 401);
  }
  static forbidden(message = "You do not have permission to perform this action.") {
    return new AppError(ErrorCodes.FORBIDDEN, message, 403);
  }
  static notFound(message = "Resource not found.") {
    return new AppError(ErrorCodes.NOT_FOUND, message, 404);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError(ErrorCodes.CONFLICT, message, 409, details);
  }
  static rateLimited(message = "Too many requests. Please try again later.") {
    return new AppError(ErrorCodes.RATE_LIMITED, message, 429);
  }
  static subscriptionRequired(message = "An active subscription is required for this action.") {
    return new AppError(ErrorCodes.SUBSCRIPTION_REQUIRED, message, 402);
  }
  static payment(message: string, details?: unknown) {
    return new AppError(ErrorCodes.PAYMENT_ERROR, message, 402, details);
  }
  static internal(message = "An unexpected error occurred.") {
    return new AppError(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
