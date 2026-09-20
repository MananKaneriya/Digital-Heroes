import pino from "pino";
import { env } from "../config/env.js";

/**
 * Structured logging (PRD §36). `category` separates application, security,
 * audit, error, and payment-webhook log lines so they can be filtered
 * downstream without parsing message text.
 */
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  base: { service: "digital-heroes-api" },
  transport: env.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true } } : undefined,
});

export type LogCategory = "app" | "security" | "audit" | "error" | "webhook";

export function categoryLogger(category: LogCategory) {
  return logger.child({ category });
}
