export interface RetainableScore {
  id: string;
  scoreDate: string;
}

export interface RetentionResult {
  retainedIds: string[];
  removedIds: string[];
}

/**
 * Pure specification of the "latest N retained scores" rule (PRD §6.3, §6 "important
 * date semantics"): ranked strictly by score_date, never by created_at or the order
 * scores happen to appear in the input array. This is the exact algorithm
 * apps/api/src/db/migrations/003_golf_scores.sql's create_golf_score_with_retention()
 * implements in SQL for atomic enforcement at write time (a single Postgres function
 * call is required there for true transactional safety — see that migration's
 * comments). This pure copy exists so the rule itself has an executable, thoroughly
 * unit-tested specification, and it is also applied defensively in
 * scores.service.ts's listScores() so the API can never surface more than
 * maxRetained rows even if the underlying data ever drifted from the invariant.
 */
export function selectRetainedScoreIds(scores: RetainableScore[], maxRetained: number): RetentionResult {
  const sorted = [...scores].sort((a, b) => (a.scoreDate < b.scoreDate ? 1 : a.scoreDate > b.scoreDate ? -1 : 0));
  const retained = sorted.slice(0, maxRetained);
  const removed = sorted.slice(maxRetained);
  return { retainedIds: retained.map((s) => s.id), removedIds: removed.map((s) => s.id) };
}
