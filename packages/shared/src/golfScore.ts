/**
 * Stableford scoring range and the score-retention rule (PRD §6). This is the single
 * authoritative definition — the API's zod schema, the database CHECK constraint, and
 * the frontend form all derive from these same constants rather than redefining them.
 */
export const STABLEFORD_SCORE_MIN = 1;
export const STABLEFORD_SCORE_MAX = 45;

/** Only a subscriber's most recent scores (ranked by score_date) are ever retained. */
export const MAX_RETAINED_SCORES = 5;

export function isValidStablefordScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= STABLEFORD_SCORE_MIN &&
    value <= STABLEFORD_SCORE_MAX
  );
}

/** YYYY-MM-DD — matches what Postgres's `date` type round-trips through PostgREST as. */
export type IsoDateString = string;

export interface GolfScoreDTO {
  id: string;
  score: number;
  scoreDate: IsoDateString;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGolfScoreInput {
  score: number;
  scoreDate: IsoDateString;
}

export interface UpdateGolfScoreInput {
  score?: number;
  scoreDate?: IsoDateString;
}
