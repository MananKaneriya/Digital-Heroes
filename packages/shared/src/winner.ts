/**
 * Phase F — Winner Verification & Payout (assessment implementation).
 *
 * Reuses the existing Phase E "winner" concept (a draw_matches row with a
 * non-null tier) rather than introducing a second winner entity — see
 * winner_verifications in 006_winner_verification.sql, a 1:1 companion table
 * exactly like draw_payouts already is.
 */
import type { DrawPayoutStatus, MatchTier } from "./draw.js";

export type WinnerVerificationStatus = "pending" | "submitted" | "approved" | "rejected";

/** Reuses the same size ceiling already established for charity media uploads — no new number invented. */
export const WINNER_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_WINNER_PROOF_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export interface WinnerVerificationDTO {
  drawMatchId: string;
  status: WinnerVerificationStatus;
  proofUploadedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface AdminWinnerDTO {
  drawMatchId: string;
  userId: string;
  fullName: string | null;
  email: string;
  drawId: string;
  periodStart: string;
  periodEnd: string;
  tier: MatchTier;
  prizeAmountCents: number;
  verificationStatus: WinnerVerificationStatus;
  rejectionReason: string | null;
  payoutId: string | null;
  payoutStatus: DrawPayoutStatus | null;
}

export interface AdminWinnerDetailDTO extends AdminWinnerDTO {
  /** Short-lived signed URL, or null if no proof has been uploaded yet. Never a public/permanent URL. */
  proofSignedUrl: string | null;
}

export interface RejectProofInput {
  reason: string;
}
