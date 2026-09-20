/**
 * Minimum charity contribution rule (PRD §10.2: "Minimum contribution = 10% of
 * subscription fee"). Single authoritative constant — never duplicate `10`
 * across frontend/backend.
 */
export const MIN_CHARITY_CONTRIBUTION_PERCENT = 10;

/**
 * NOT a PRD-specified maximum. The PRD only states subscribers "may voluntarily
 * increase the contribution percentage" and asks for validation of "the allowed
 * maximum according to configured business rules" without stating one. 100 is
 * used here purely as a mathematical sanity ceiling — a contribution literally
 * cannot exceed 100% of the subscription fee it's a percentage of — not an
 * invented business rule. Kept as a named constant so it stays easy to find
 * and change if the product later defines an actual policy maximum.
 */
export const MAX_CHARITY_CONTRIBUTION_PERCENT = 100;

export function isValidContributionPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_CHARITY_CONTRIBUTION_PERCENT &&
    value <= MAX_CHARITY_CONTRIBUTION_PERCENT
  );
}

/**
 * Safe monetary arithmetic for charity contributions: both operands are
 * integer minor units (cents); the result is rounded to the nearest whole
 * cent using standard round-half-away-from-zero (JS `Math.round`), never
 * settled with fractional floating-point dollars.
 */
export function calculateContributionCents(subscriptionAmountCents: number, contributionPercent: number): number {
  if (!Number.isInteger(subscriptionAmountCents) || subscriptionAmountCents < 0) {
    throw new Error("subscriptionAmountCents must be a non-negative integer number of cents.");
  }
  return Math.round((subscriptionAmountCents * contributionPercent) / 100);
}

export type CharityMediaType = "image";
export type DonationStatus = "pending" | "completed" | "failed";

export interface CharityDTO {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  fullDescription: string;
  logoUrl: string | null;
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CharityMediaDTO {
  id: string;
  charityId: string;
  url: string;
  mediaType: CharityMediaType;
  altText: string | null;
  displayOrder: number;
}

export interface CharityEventDTO {
  id: string;
  charityId: string;
  title: string;
  description: string;
  eventDate: string;
  location: string | null;
  isActive: boolean;
}

export interface CharitySelectionDTO {
  charityId: string;
  charityName: string;
  contributionPercent: number;
  effectiveFrom: string;
}

export interface CharityContributionDTO {
  id: string;
  charityId: string;
  charityName: string;
  contributionPercent: number;
  subscriptionAmountCents: number;
  contributionCents: number;
  periodEnd: string;
  createdAt: string;
}

export interface IndependentDonationDTO {
  id: string;
  charityId: string;
  amountCents: number;
  currency: string;
  status: DonationStatus;
  createdAt: string;
}

export interface SelectCharityInput {
  charityId: string;
  contributionPercent: number;
}

export interface CreateDonationInput {
  charityId: string;
  amountCents: number;
}
