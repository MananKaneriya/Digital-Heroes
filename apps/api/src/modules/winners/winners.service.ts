import {
  ALLOWED_WINNER_PROOF_MIME_TYPES,
  WINNER_PROOF_MAX_BYTES,
  type AdminWinnerDTO,
  type AdminWinnerDetailDTO,
  type DrawPayoutStatus,
  type MatchTier,
  type Role,
  type WinnerVerificationDTO,
  type WinnerVerificationStatus,
} from "@digital-heroes/shared";
import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { recordAudit } from "../audit/audit.service.js";

const WINNER_PROOF_BUCKET = "winner-proof";
const SIGNED_URL_TTL_SECONDS = 300;

interface MatchRow {
  id: string;
  draw_id: string;
  user_id: string;
  tier: number | null;
  prize_amount_cents: number;
}

interface MatchWithContextRow extends MatchRow {
  draws: { period_start: string; period_end: string } | null;
  profiles: { full_name: string | null; email: string } | null;
}

interface VerificationRow {
  id: string;
  draw_match_id: string;
  user_id: string;
  status: WinnerVerificationStatus;
  proof_storage_path: string | null;
  proof_uploaded_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
}

/** A "winner" is a draw_matches row with a non-null tier — reused as-is from Phase E, never duplicated. */
async function loadWinningMatch(drawMatchId: string): Promise<MatchRow> {
  const { data, error } = await supabaseAdmin
    .from("draw_matches")
    .select("id, draw_id, user_id, tier, prize_amount_cents")
    .eq("id", drawMatchId)
    .maybeSingle();
  if (error) throw AppError.internal("Failed to load the winner record.");
  if (!data || data.tier === null) throw AppError.notFound("Winner record not found.");
  return data as MatchRow;
}

async function loadWinningMatchWithContext(drawMatchId: string): Promise<MatchWithContextRow> {
  const { data, error } = await supabaseAdmin
    .from("draw_matches")
    .select("id, draw_id, user_id, tier, prize_amount_cents, draws(period_start, period_end), profiles(full_name, email)")
    .eq("id", drawMatchId)
    .maybeSingle();
  if (error) throw AppError.internal("Failed to load the winner record.");
  if (!data || data.tier === null) throw AppError.notFound("Winner record not found.");
  return data as unknown as MatchWithContextRow;
}

async function loadVerification(drawMatchId: string): Promise<VerificationRow> {
  const { data, error } = await supabaseAdmin.from("winner_verifications").select("*").eq("draw_match_id", drawMatchId).maybeSingle();
  if (error) throw AppError.internal("Failed to load the verification record.");
  // Every winning match gets a verification row created at publish time (see
  // publishDraw in draws.service.ts) — a missing row here means the winner id
  // itself doesn't correspond to an actual published winner.
  if (!data) throw AppError.notFound("Verification record not found for this winner.");
  return data as VerificationRow;
}

function verificationRowToDTO(row: VerificationRow): WinnerVerificationDTO {
  return {
    drawMatchId: row.draw_match_id,
    status: row.status,
    proofUploadedAt: row.proof_uploaded_at,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
  };
}

/**
 * Only the authenticated winner may upload proof for their own record — no
 * admin override here, unlike ownership checks elsewhere in the app, because
 * the whole point of verification is that the winner themselves supplies the
 * evidence (PRD §6: "Only the authenticated winner can upload proof for their
 * own winner record.").
 */
export async function uploadProof(
  userId: string,
  drawMatchId: string,
  file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  requestId: string,
): Promise<WinnerVerificationDTO> {
  const match = await loadWinningMatch(drawMatchId);
  if (match.user_id !== userId) throw AppError.forbidden("You can only upload proof for your own winning result.");

  const verification = await loadVerification(drawMatchId);
  if (verification.status !== "pending" && verification.status !== "rejected") {
    throw AppError.conflict(
      verification.status === "approved"
        ? "This winner has already been verified."
        : "Proof has already been submitted and is awaiting review.",
    );
  }

  if (!(ALLOWED_WINNER_PROOF_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    throw AppError.validation("Only PNG, JPEG, or WEBP images are allowed.");
  }
  if (file.size > WINNER_PROOF_MAX_BYTES) {
    throw AppError.validation("The proof image must be 5MB or smaller.");
  }

  const extension = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
  const storagePath = `${drawMatchId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(WINNER_PROOF_BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (uploadError) throw AppError.internal("Failed to upload the proof image.");

  if (verification.proof_storage_path) {
    // Best-effort cleanup of a prior (e.g. rejected) submission; never blocks the new one.
    await supabaseAdmin.storage.from(WINNER_PROOF_BUCKET).remove([verification.proof_storage_path]).catch(() => undefined);
  }

  // The update is conditioned on the status still being what we just read (Phase H
  // hardening): two concurrent uploads could otherwise both pass the check above
  // before either writes. `.in("status", [...])` makes this an atomic
  // check-and-set at the database level — if another request already moved the
  // row past pending/rejected, zero rows match and `updated` comes back null,
  // which is treated as a conflict rather than silently overwriting.
  const { data: updated, error } = await supabaseAdmin
    .from("winner_verifications")
    .update({ status: "submitted", proof_storage_path: storagePath, proof_uploaded_at: new Date().toISOString(), rejection_reason: null })
    .eq("draw_match_id", drawMatchId)
    .in("status", ["pending", "rejected"])
    .select("*")
    .maybeSingle();
  if (error) throw AppError.internal("Failed to record the proof submission.");
  if (!updated) {
    // Lost the race: the file we just uploaded above is now an orphan (the DB
    // row that would have referenced it was never written). Best-effort clean
    // it up so it doesn't sit in the bucket forever; never blocks the conflict response.
    await supabaseAdmin.storage.from(WINNER_PROOF_BUCKET).remove([storagePath]).catch(() => undefined);
    throw AppError.conflict("This winner's verification status changed while your upload was in progress. Please refresh and try again.");
  }

  await recordAudit({
    actorId: userId,
    actorRole: "subscriber",
    action: "winner.proof_uploaded",
    entityType: "winner_verification",
    entityId: drawMatchId,
    previousState: { status: verification.status, previousRejectionReason: verification.rejection_reason },
    // storagePath is a reference, not proof content — never store the image itself in the audit log.
    newState: { status: "submitted", storagePath },
    requestId,
  });

  return verificationRowToDTO(updated as VerificationRow);
}

/**
 * Shared by both the winner's own "view my result" route and the admin
 * detail route — the ownership check is the only thing that differs between
 * them, so this is one function rather than two near-duplicate services.
 */
export async function getWinnerDetail(drawMatchId: string, requesterId: string, requesterRole: Role): Promise<AdminWinnerDetailDTO> {
  const match = await loadWinningMatchWithContext(drawMatchId);
  if (match.user_id !== requesterId && requesterRole !== "admin") {
    throw AppError.forbidden("You can only view your own winner record.");
  }

  const verification = await loadVerification(drawMatchId);

  const { data: payout, error: payoutError } = await supabaseAdmin
    .from("draw_payouts")
    .select("id, status")
    .eq("draw_match_id", drawMatchId)
    .maybeSingle();
  if (payoutError) throw AppError.internal("Failed to load payout status.");

  let proofSignedUrl: string | null = null;
  if (verification.proof_storage_path) {
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(WINNER_PROOF_BUCKET)
      .createSignedUrl(verification.proof_storage_path, SIGNED_URL_TTL_SECONDS);
    if (signError) throw AppError.internal("Failed to generate a proof access link.");
    proofSignedUrl = signed?.signedUrl ?? null;
  }

  return {
    drawMatchId: match.id,
    userId: match.user_id,
    fullName: match.profiles?.full_name ?? null,
    email: match.profiles?.email ?? "",
    drawId: match.draw_id,
    periodStart: match.draws?.period_start ?? "",
    periodEnd: match.draws?.period_end ?? "",
    tier: match.tier as MatchTier,
    prizeAmountCents: match.prize_amount_cents,
    verificationStatus: verification.status,
    rejectionReason: verification.rejection_reason,
    payoutId: payout?.id ?? null,
    payoutStatus: (payout?.status as DrawPayoutStatus | undefined) ?? null,
    proofSignedUrl,
  };
}

export async function approveWinner(adminId: string, drawMatchId: string, requestId: string): Promise<void> {
  const verification = await loadVerification(drawMatchId);
  if (verification.status !== "submitted") {
    throw AppError.validation("Only a submitted proof awaiting review can be approved.");
  }

  // Conditioned on status still being "submitted" (Phase H hardening) — guards
  // against a concurrent approve/reject double-decision on the same proof.
  const { data: updated, error } = await supabaseAdmin
    .from("winner_verifications")
    .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: adminId })
    .eq("draw_match_id", drawMatchId)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();
  if (error) throw AppError.internal("Failed to approve the winner.");
  if (!updated) throw AppError.conflict("This winner's verification was already decided by another request.");

  await recordAudit({
    actorId: adminId,
    actorRole: "admin",
    action: "winner.verification_approved",
    entityType: "winner_verification",
    entityId: drawMatchId,
    previousState: { status: verification.status },
    newState: { status: "approved" },
    requestId,
  });
}

export async function rejectWinner(adminId: string, drawMatchId: string, reason: string, requestId: string): Promise<void> {
  const verification = await loadVerification(drawMatchId);
  if (verification.status !== "submitted") {
    throw AppError.validation("Only a submitted proof awaiting review can be rejected.");
  }

  // Conditioned on status still being "submitted" (Phase H hardening) — guards
  // against a concurrent approve/reject double-decision on the same proof.
  const { data: updated, error } = await supabaseAdmin
    .from("winner_verifications")
    .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: adminId, rejection_reason: reason })
    .eq("draw_match_id", drawMatchId)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();
  if (error) throw AppError.internal("Failed to reject the winner's proof.");
  if (!updated) throw AppError.conflict("This winner's verification was already decided by another request.");

  await recordAudit({
    actorId: adminId,
    actorRole: "admin",
    action: "winner.verification_rejected",
    entityType: "winner_verification",
    entityId: drawMatchId,
    previousState: { status: verification.status },
    newState: { status: "rejected", reason },
    requestId,
  });
}

export interface AdminListWinnersQuery {
  page: number;
  pageSize: number;
  verificationStatus?: WinnerVerificationStatus;
  payoutStatus?: DrawPayoutStatus;
  tier?: MatchTier;
  drawId?: string;
}

/**
 * Filters on verification/payout status are resolved to a set of draw_match
 * ids first (two small companion tables). Shared by adminListWinners below
 * and by the Phase G winner-analytics report (reports.service.ts), so this
 * lookup is written exactly once rather than duplicated between the two —
 * `undefined` means "no such filter requested", not "matched nothing".
 */
export async function resolveMatchIdsForStatusFilters(filters: {
  verificationStatus?: WinnerVerificationStatus;
  payoutStatus?: DrawPayoutStatus;
}): Promise<string[] | undefined> {
  let matchIdFilter: string[] | undefined;

  if (filters.verificationStatus) {
    const { data, error } = await supabaseAdmin.from("winner_verifications").select("draw_match_id").eq("status", filters.verificationStatus);
    if (error) throw AppError.internal("Failed to filter by verification status.");
    matchIdFilter = (data ?? []).map((r) => r.draw_match_id);
  }

  if (filters.payoutStatus) {
    const { data, error } = await supabaseAdmin.from("draw_payouts").select("draw_match_id").eq("status", filters.payoutStatus);
    if (error) throw AppError.internal("Failed to filter by payout status.");
    const payoutMatchIds = new Set((data ?? []).map((r) => r.draw_match_id));
    matchIdFilter = matchIdFilter ? matchIdFilter.filter((id) => payoutMatchIds.has(id)) : [...payoutMatchIds];
  }

  return matchIdFilter;
}

export async function adminListWinners(query: AdminListWinnersQuery): Promise<{ winners: AdminWinnerDTO[]; total: number }> {
  const matchIdFilter = await resolveMatchIdsForStatusFilters({ verificationStatus: query.verificationStatus, payoutStatus: query.payoutStatus });

  if (matchIdFilter && matchIdFilter.length === 0) return { winners: [], total: 0 };

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let builder = supabaseAdmin
    .from("draw_matches")
    .select("id, user_id, draw_id, tier, prize_amount_cents, draws(period_start, period_end), profiles(full_name, email)", { count: "exact" })
    .not("tier", "is", null)
    .order("created_at", { ascending: false });

  if (query.tier) builder = builder.eq("tier", query.tier);
  if (query.drawId) builder = builder.eq("draw_id", query.drawId);
  if (matchIdFilter) builder = builder.in("id", matchIdFilter);

  const { data: matchRows, error, count } = await builder.range(from, to);
  if (error) throw AppError.internal("Failed to load winners.");

  const rows = (matchRows ?? []) as unknown as MatchWithContextRow[];
  const matchIds = rows.map((r) => r.id);

  const verificationByMatch = new Map<string, { status: WinnerVerificationStatus; rejection_reason: string | null }>();
  const payoutByMatch = new Map<string, { id: string; status: DrawPayoutStatus }>();

  if (matchIds.length > 0) {
    const { data: verificationRows, error: vErr } = await supabaseAdmin
      .from("winner_verifications")
      .select("draw_match_id, status, rejection_reason")
      .in("draw_match_id", matchIds);
    if (vErr) throw AppError.internal("Failed to load verification statuses.");
    for (const v of verificationRows ?? []) {
      verificationByMatch.set(v.draw_match_id, { status: v.status as WinnerVerificationStatus, rejection_reason: v.rejection_reason });
    }

    const { data: payoutRows, error: pErr } = await supabaseAdmin.from("draw_payouts").select("id, draw_match_id, status").in("draw_match_id", matchIds);
    if (pErr) throw AppError.internal("Failed to load payout statuses.");
    for (const p of payoutRows ?? []) payoutByMatch.set(p.draw_match_id, { id: p.id, status: p.status as DrawPayoutStatus });
  }

  const winners: AdminWinnerDTO[] = rows.map((r) => {
    const verification = verificationByMatch.get(r.id);
    const payout = payoutByMatch.get(r.id);
    return {
      drawMatchId: r.id,
      userId: r.user_id,
      fullName: r.profiles?.full_name ?? null,
      email: r.profiles?.email ?? "",
      drawId: r.draw_id,
      periodStart: r.draws?.period_start ?? "",
      periodEnd: r.draws?.period_end ?? "",
      tier: r.tier as MatchTier,
      prizeAmountCents: r.prize_amount_cents,
      verificationStatus: verification?.status ?? "pending",
      rejectionReason: verification?.rejection_reason ?? null,
      payoutId: payout?.id ?? null,
      payoutStatus: payout?.status ?? null,
    };
  });

  return { winners, total: count ?? 0 };
}
