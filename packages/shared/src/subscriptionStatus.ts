/**
 * Internal subscription lifecycle states (PRD §5.3).
 * Stripe's own status vocabulary is mapped down to this smaller, product-meaningful set
 * so the rest of the app never has to reason about provider-specific statuses.
 */
export type SubscriptionStatus =
  | "incomplete" // checkout started, payment not yet confirmed
  | "active" // paid and currently entitled to subscriber features
  | "past_due" // payment failed but provider is still retrying
  | "canceled" // user canceled; access continues until current_period_end if cancel_at_period_end
  | "lapsed"; // period ended with no active payment — access revoked

/** A subscription grants access to subscriber-only features in exactly these states. */
export const ACCESS_GRANTING_STATUSES: readonly SubscriptionStatus[] = ["active", "past_due"];

export function grantsAccess(status: SubscriptionStatus, currentPeriodEnd: string | Date | null): boolean {
  if (!ACCESS_GRANTING_STATUSES.includes(status)) return false;
  if (!currentPeriodEnd) return status === "active";
  return new Date(currentPeriodEnd).getTime() > Date.now();
}

/**
 * Maps a Stripe subscription `status` string to our internal status.
 * Kept as a pure function so it is unit-testable without a live Stripe connection.
 */
/**
 * The status persisted on the row is the last value a webhook/checkout told us.
 * This derives what should actually be *displayed and enforced* right now —
 * e.g. an "active" row whose period has already ended reads as "lapsed" even
 * before any further provider event arrives, so access checks never trust a
 * stale client-visible flag (PRD §5.3: "Do not assume a client-side
 * subscription flag is authoritative.").
 */
export function effectiveStatus(status: SubscriptionStatus, currentPeriodEnd: string | Date | null): SubscriptionStatus {
  if (status === "canceled" || status === "incomplete") return status;
  return grantsAccess(status, currentPeriodEnd) ? status : "lapsed";
}

export function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "lapsed";
  }
}
