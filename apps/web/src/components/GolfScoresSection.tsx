import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MAX_RETAINED_SCORES,
  STABLEFORD_SCORE_MAX,
  STABLEFORD_SCORE_MIN,
  isValidStablefordScore,
  type GolfScoreDTO,
} from "@digital-heroes/shared";
import { api, ApiClientError } from "../api/client";

const SCORES_QUERY_KEY = ["golf-scores"];

function formatDate(isoDate: string): string {
  // Parsed as UTC so the displayed calendar day always matches the stored date,
  // regardless of the viewer's timezone offset.
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ScoreFormValues {
  score: string;
  scoreDate: string;
}

function validateForm(values: ScoreFormValues): string | null {
  if (values.score.trim() === "") return "Enter a Stableford score.";
  const numericScore = Number(values.score);
  if (!isValidStablefordScore(numericScore)) {
    return `Score must be a whole number between ${STABLEFORD_SCORE_MIN} and ${STABLEFORD_SCORE_MAX}.`;
  }
  if (!values.scoreDate) return "Choose the date this round was played.";
  return null;
}

export function GolfScoresSection() {
  const queryClient = useQueryClient();
  const [addForm, setAddForm] = useState<ScoreFormValues>({ score: "", scoreDate: todayIsoDate() });
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ScoreFormValues>({ score: "", scoreDate: "" });
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    data: scores,
    isLoading,
    isError,
  } = useQuery({
    queryKey: SCORES_QUERY_KEY,
    queryFn: () => api.get<GolfScoreDTO[]>("/api/scores"),
  });

  const createMutation = useMutation({
    mutationFn: (input: { score: number; scoreDate: string }) => api.post<GolfScoreDTO[]>("/api/scores", input),
    onSuccess: (updated) => {
      queryClient.setQueryData(SCORES_QUERY_KEY, updated);
      setAddForm({ score: "", scoreDate: todayIsoDate() });
      setAddError(null);
    },
    onError: (err) => setAddError(err instanceof ApiClientError ? err.message : "Could not add that score."),
  });

  const updateMutation = useMutation({
    mutationFn: (params: { id: string; score: number; scoreDate: string }) =>
      api.patch<GolfScoreDTO[]>(`/api/scores/${params.id}`, { score: params.score, scoreDate: params.scoreDate }),
    onSuccess: (updated) => {
      queryClient.setQueryData(SCORES_QUERY_KEY, updated);
      setEditingId(null);
      setEditError(null);
    },
    onError: (err) => setEditError(err instanceof ApiClientError ? err.message : "Could not update that score."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<GolfScoreDTO[]>(`/api/scores/${id}`),
    onSuccess: (updated) => {
      queryClient.setQueryData(SCORES_QUERY_KEY, updated);
      setConfirmingDeleteId(null);
      setDeleteError(null);
    },
    onError: (err) => setDeleteError(err instanceof ApiClientError ? err.message : "Could not delete that score."),
  });

  function submitAdd(e: FormEvent) {
    e.preventDefault();
    const validationError = validateForm(addForm);
    if (validationError) {
      setAddError(validationError);
      return;
    }
    createMutation.mutate({ score: Number(addForm.score), scoreDate: addForm.scoreDate });
  }

  function startEdit(score: GolfScoreDTO) {
    setEditingId(score.id);
    setEditForm({ score: String(score.score), scoreDate: score.scoreDate });
    setEditError(null);
  }

  function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const validationError = validateForm(editForm);
    if (validationError) {
      setEditError(validationError);
      return;
    }
    updateMutation.mutate({ id: editingId, score: Number(editForm.score), scoreDate: editForm.scoreDate });
  }

  const scoreCount = scores?.length ?? 0;

  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Golf scores</h2>
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        We retain your latest {MAX_RETAINED_SCORES} Stableford scores. Adding a new one beyond that automatically
        removes your oldest recorded round.
      </p>

      <form className="stack" onSubmit={submitAdd} noValidate style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-field" style={{ marginBottom: 0, minWidth: 140 }}>
            <label htmlFor="add-score">Stableford score</label>
            <input
              id="add-score"
              type="number"
              min={STABLEFORD_SCORE_MIN}
              max={STABLEFORD_SCORE_MAX}
              step={1}
              value={addForm.score}
              onChange={(e) => {
                setAddError(null);
                setAddForm((f) => ({ ...f, score: e.target.value }));
              }}
            />
          </div>
          <div className="form-field" style={{ marginBottom: 0, minWidth: 160 }}>
            <label htmlFor="add-date">Date played</label>
            <input
              id="add-date"
              type="date"
              max={todayIsoDate()}
              value={addForm.scoreDate}
              onChange={(e) => {
                setAddError(null);
                setAddForm((f) => ({ ...f, scoreDate: e.target.value }));
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding…" : "Add score"}
          </button>
        </div>
        {addError && (
          <div className="form-error" role="alert">
            {addError}
          </div>
        )}
      </form>

      {isLoading && <p style={{ color: "var(--color-text-muted)" }}>Loading your scores…</p>}

      {isError && (
        <div className="form-error" role="alert">
          We couldn't load your scores. Please try again.
        </div>
      )}

      {scores && scores.length === 0 && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No golf scores yet.</p>
          <p style={{ margin: 0 }}>Add your first Stableford score above.</p>
        </div>
      )}

      {scores && scores.length > 0 && (
        <div className="stack">
          <p style={{ margin: 0, fontWeight: 600, textTransform: "uppercase", fontSize: "0.78rem", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>
            Your latest {scoreCount} of {MAX_RETAINED_SCORES} scores
          </p>
          {deleteError && (
            <div className="form-error" role="alert">
              {deleteError}
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scores.map((score) =>
                editingId === score.id ? (
                  <tr key={score.id}>
                    <td colSpan={3}>
                      <form className="stack" onSubmit={submitEdit} noValidate>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                          <div className="form-field" style={{ marginBottom: 0, minWidth: 120 }}>
                            <label htmlFor={`edit-score-${score.id}`}>Score</label>
                            <input
                              id={`edit-score-${score.id}`}
                              type="number"
                              min={STABLEFORD_SCORE_MIN}
                              max={STABLEFORD_SCORE_MAX}
                              step={1}
                              value={editForm.score}
                              onChange={(e) => {
                                setEditError(null);
                                setEditForm((f) => ({ ...f, score: e.target.value }));
                              }}
                            />
                          </div>
                          <div className="form-field" style={{ marginBottom: 0, minWidth: 150 }}>
                            <label htmlFor={`edit-date-${score.id}`}>Date</label>
                            <input
                              id={`edit-date-${score.id}`}
                              type="date"
                              max={todayIsoDate()}
                              value={editForm.scoreDate}
                              onChange={(e) => {
                                setEditError(null);
                                setEditForm((f) => ({ ...f, scoreDate: e.target.value }));
                              }}
                            />
                          </div>
                          <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? "Saving…" : "Save"}
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                        {editError && (
                          <div className="form-error" role="alert">
                            {editError}
                          </div>
                        )}
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={score.id}>
                    <td>{formatDate(score.scoreDate)}</td>
                    <td>{score.score}</td>
                    <td style={{ textAlign: "right" }}>
                      {confirmingDeleteId === score.id ? (
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          Delete this golf score?
                          <button
                            className="btn btn-danger"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(score.id)}
                          >
                            Delete
                          </button>
                          <button className="btn btn-ghost" onClick={() => setConfirmingDeleteId(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 8 }}>
                          <button className="btn btn-ghost" onClick={() => startEdit(score)}>
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmingDeleteId(score.id);
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
