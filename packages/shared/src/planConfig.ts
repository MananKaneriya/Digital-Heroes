/**
 * Digital Heroes subscription plans.
 *
 * The database (`subscription_plans` table) is the authoritative source at
 * runtime — this file only supplies the initial seed values so plan pricing
 * is defined in exactly one place rather than duplicated across the seed
 * script, tests, and documentation. Admins change pricing by editing rows,
 * never by editing code (PRD §5.1: "Plan data must be configurable rather
 * than duplicated throughout the codebase.").
 */

export type PlanCode = "monthly" | "yearly";
export type BillingInterval = "month" | "year";

export interface PlanDefaults {
  code: PlanCode;
  name: string;
  billingInterval: BillingInterval;
  priceCents: number;
  currency: string;
  description: string;
}

/** Yearly plan is discounted vs. paying monthly for 12 months. */
export const MONTHLY_PRICE_CENTS = 1200; // $12.00 / month
export const YEARLY_PRICE_CENTS = 12000; // $120.00 / year ($10.00/mo equivalent, ~16.7% off)

export const PLAN_DEFAULTS: readonly PlanDefaults[] = [
  {
    code: "monthly",
    name: "Monthly Plan",
    billingInterval: "month",
    priceCents: MONTHLY_PRICE_CENTS,
    currency: "usd",
    description: "Billed every month. Cancel anytime.",
  },
  {
    code: "yearly",
    name: "Yearly Plan",
    billingInterval: "year",
    priceCents: YEARLY_PRICE_CENTS,
    currency: "usd",
    description: "Billed once a year at a discounted rate vs. paying monthly.",
  },
];

export function formatPrice(priceCents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(priceCents / 100);
}
