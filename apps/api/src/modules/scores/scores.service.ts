import {
  MAX_RETAINED_SCORES,
  STABLEFORD_SCORE_MAX,
  STABLEFORD_SCORE_MIN,
  type GolfScoreDTO,
  type Role,
} from "@digital-heroes/shared";
import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../lib/errors.js";
import { categoryLogger } from "../../lib/logger.js";
import { recordAudit } from "../audit/audit.service.js";
import { selectRetainedScoreIds } from "./scoreRetention.js";

const appLog = categoryLogger("app");

const DUPLICATE_DATE_MESSAGE = "You already have a score recorded for this date. Edit the existing entry instead.";

interface ScoreRow {
  id: string;
  user_id: string;
  score: number;
  score_date: string;
  created_at: string;
  updated_at: string;
}

function rowToDTO(row: ScoreRow): GolfScoreDTO {
  return { id: row.id, score: row.score, scoreDate: row.score_date, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Ownership check reused by update/delete — an admin may act on any subscriber's score (PRD §15). */
function assertOwnership(ownerId: string, requesterId: string, requesterRole: Role): void {
  if (ownerId !== requesterId && requesterRole !== "admin") {
    throw AppError.forbidden("You can only manage your own golf scores.");
  }
}

async function fetchOwnedScore(scoreId: string): Promise<ScoreRow> {
  const { data, error } = await supabaseAdmin.from("golf_scores").select("*").eq("id", scoreId).maybeSingle();
  if (error) throw AppError.internal("Failed to load the score.");
  if (!data) throw AppError.notFound("Score not found.");
  return data as ScoreRow;
}

/**
 * Application-level duplicate-date check for a fast, friendly error message. This is
 * a UX convenience only — the (user_id, score_date) unique constraint in
 * 003_golf_scores.sql is the actual enforcement, catching the race condition where
 * two requests for the same date are submitted concurrently (PRD §6.2/§6.3).
 */
async function findDuplicateDate(userId: string, scoreDate: string, excludeId?: string): Promise<boolean> {
  let builder = supabaseAdmin.from("golf_scores").select("id").eq("user_id", userId).eq("score_date", scoreDate);
  if (excludeId) builder = builder.neq("id", excludeId);
  const { data, error } = await builder.maybeSingle();
  if (error) throw AppError.internal("Failed to validate the score date.");
  return Boolean(data);
}

export async function listScores(userId: string): Promise<GolfScoreDTO[]> {
  const { data, error } = await supabaseAdmin
    .from("golf_scores")
    .select("*")
    .eq("user_id", userId)
    .order("score_date", { ascending: false });
  if (error) throw AppError.internal("Failed to load golf scores.");

  const rows = (data ?? []) as ScoreRow[];
  const { retainedIds } = selectRetainedScoreIds(
    rows.map((r) => ({ id: r.id, scoreDate: r.score_date })),
    MAX_RETAINED_SCORES,
  );
  const retainedSet = new Set(retainedIds);
  return rows.filter((r) => retainedSet.has(r.id)).map(rowToDTO);
}

export async function createScore(
  userId: string,
  requesterRole: Role,
  input: { score: number; scoreDate: string },
  requestId: string,
): Promise<GolfScoreDTO[]> {
  if (await findDuplicateDate(userId, input.scoreDate)) {
    throw AppError.conflict(DUPLICATE_DATE_MESSAGE);
  }

  const { data, error } = await supabaseAdmin.rpc("create_golf_score_with_retention", {
    p_user_id: userId,
    p_score: input.score,
    p_score_date: input.scoreDate,
    p_max_retained: MAX_RETAINED_SCORES,
  });

  if (error) {
    if (error.code === "23505") throw AppError.conflict(DUPLICATE_DATE_MESSAGE);
    if (error.code === "23514") throw AppError.validation(`Score must be between ${STABLEFORD_SCORE_MIN} and ${STABLEFORD_SCORE_MAX}.`);
    appLog.error({ err: error, userId }, "create_golf_score_with_retention failed");
    throw AppError.internal("Failed to save the score.");
  }

  const result = data as { score: ScoreRow; removedIds: string[] };

  await recordAudit({
    actorId: userId,
    actorRole: requesterRole,
    action: "score.created",
    entityType: "golf_score",
    entityId: result.score.id,
    newState: { score: result.score.score, scoreDate: result.score.score_date },
    requestId,
  });

  for (const removedId of result.removedIds ?? []) {
    await recordAudit({
      actorId: userId,
      actorRole: requesterRole,
      action: "score.retention_removed",
      entityType: "golf_score",
      entityId: removedId,
      reason: `Automatically removed to keep only the latest ${MAX_RETAINED_SCORES} retained scores; the subscriber did not delete this entry.`,
      requestId,
    });
  }

  return listScores(userId);
}

export async function updateScore(
  scoreId: string,
  requesterId: string,
  requesterRole: Role,
  input: { score?: number; scoreDate?: string },
  requestId: string,
): Promise<GolfScoreDTO[]> {
  const existing = await fetchOwnedScore(scoreId);
  assertOwnership(existing.user_id, requesterId, requesterRole);

  const nextScore = input.score ?? existing.score;
  const nextDate = input.scoreDate ?? existing.score_date;

  if (nextDate !== existing.score_date && (await findDuplicateDate(existing.user_id, nextDate, scoreId))) {
    throw AppError.conflict(DUPLICATE_DATE_MESSAGE);
  }

  const { data, error } = await supabaseAdmin
    .from("golf_scores")
    .update({ score: nextScore, score_date: nextDate })
    .eq("id", scoreId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw AppError.conflict(DUPLICATE_DATE_MESSAGE);
    if (error.code === "23514") throw AppError.validation(`Score must be between ${STABLEFORD_SCORE_MIN} and ${STABLEFORD_SCORE_MAX}.`);
    throw AppError.internal("Failed to update the score.");
  }

  const isAdminOverride = requesterRole === "admin" && existing.user_id !== requesterId;

  await recordAudit({
    actorId: requesterId,
    actorRole: requesterRole,
    action: "score.updated",
    entityType: "golf_score",
    entityId: scoreId,
    previousState: { score: existing.score, scoreDate: existing.score_date },
    newState: { score: nextScore, scoreDate: nextDate },
    reason: isAdminOverride ? "Administrator override." : undefined,
    requestId,
  });

  return listScores((data as ScoreRow).user_id);
}

export async function deleteScore(
  scoreId: string,
  requesterId: string,
  requesterRole: Role,
  requestId: string,
): Promise<GolfScoreDTO[]> {
  const existing = await fetchOwnedScore(scoreId);
  assertOwnership(existing.user_id, requesterId, requesterRole);

  const { error } = await supabaseAdmin.from("golf_scores").delete().eq("id", scoreId);
  if (error) throw AppError.internal("Failed to delete the score.");

  const isAdminOverride = requesterRole === "admin" && existing.user_id !== requesterId;

  await recordAudit({
    actorId: requesterId,
    actorRole: requesterRole,
    action: "score.deleted",
    entityType: "golf_score",
    entityId: scoreId,
    previousState: { score: existing.score, scoreDate: existing.score_date },
    reason: isAdminOverride ? "Administrator override." : undefined,
    requestId,
  });

  return listScores(existing.user_id);
}
