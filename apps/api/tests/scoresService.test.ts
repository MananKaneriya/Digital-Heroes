import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScore, deleteScore, listScores, updateScore } from "../src/modules/scores/scores.service.js";

/**
 * scores.service.ts talks to Supabase and the shared audit module directly (there is
 * no dependency-injection layer in this codebase — see subscriptions.service.ts for
 * the same established pattern). To unit test the service's business logic (ownership,
 * duplicate-date handling, admin override, audit integration, and the "no partial
 * side effects on failure" requirement) without a live database, both modules are
 * replaced with a minimal fake that mimics just the supabase-js query-builder shape
 * this service actually calls.
 */
const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));
const recordAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: { from: fromMock, rpc: rpcMock },
}));

vi.mock("../src/modules/audit/audit.service.js", () => ({
  recordAudit: recordAuditMock,
}));

function chainable(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "order", "update", "delete", "insert", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const existingScore = {
  id: "score-1",
  user_id: "owner-1",
  score: 30,
  score_date: "2026-09-01",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  recordAuditMock.mockClear();
});

describe("createScore", () => {
  it("rejects a duplicate date without ever calling the retention RPC or writing an audit entry", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: { id: "existing" }, error: null }));

    await expect(createScore("user-1", "subscriber", { score: 30, scoreDate: "2026-09-20" }, "req-1")).rejects.toMatchObject({
      status: 409,
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("creates a score, audits the creation and each automatic retention removal, and returns the fresh list", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: null, error: null })) // duplicate check: none found
      .mockReturnValueOnce(
        chainable({
          data: [{ id: "new-1", user_id: "user-1", score: 37, score_date: "2026-09-20", created_at: "t", updated_at: "t" }],
          error: null,
        }),
      ); // listScores after create
    rpcMock.mockResolvedValueOnce({
      data: {
        score: { id: "new-1", user_id: "user-1", score: 37, score_date: "2026-09-20", created_at: "t", updated_at: "t" },
        removedIds: ["old-1"],
      },
      error: null,
    });

    const result = await createScore("user-1", "subscriber", { score: 37, scoreDate: "2026-09-20" }, "req-1");

    expect(result).toEqual([{ id: "new-1", score: 37, scoreDate: "2026-09-20", createdAt: "t", updatedAt: "t" }]);
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "score.created", entityId: "new-1" }));
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "score.retention_removed", entityId: "old-1" }),
    );
  });

  it("does not record any audit entry when the retention transaction fails (no partial side effects)", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: null, error: null }));
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "XXXXX", message: "boom" } });

    await expect(createScore("user-1", "subscriber", { score: 37, scoreDate: "2026-09-20" }, "req-1")).rejects.toMatchObject({
      status: 500,
    });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("translates a race-condition unique-constraint violation into a clean conflict error, not a raw DB error", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: null, error: null }));
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "golf_scores_user_id_score_date_key"' } });

    await expect(createScore("user-1", "subscriber", { score: 37, scoreDate: "2026-09-20" }, "req-1")).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("already have a score"),
    });
  });
});

describe("updateScore", () => {
  it("throws not found when the score does not exist", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: null, error: null }));

    await expect(updateScore("missing", "user-1", "subscriber", { score: 30 }, "req-1")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws forbidden when a non-admin tries to edit another subscriber's score", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: existingScore, error: null }));

    await expect(updateScore("score-1", "someone-else", "subscriber", { score: 40 }, "req-1")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows an admin to edit another subscriber's score and records why in the audit entry", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: existingScore, error: null })) // fetchOwnedScore
      .mockReturnValueOnce(chainable({ data: { ...existingScore, score: 40 }, error: null })) // update
      .mockReturnValueOnce(chainable({ data: [{ ...existingScore, score: 40 }], error: null })); // listScores

    const result = await updateScore("score-1", "admin-1", "admin", { score: 40 }, "req-1");

    expect(result[0].score).toBe(40);
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "score.updated", reason: "Administrator override." }),
    );
  });

  it("rejects updating to a date that collides with another existing score", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: existingScore, error: null })) // fetchOwnedScore
      .mockReturnValueOnce(chainable({ data: { id: "other-score" }, error: null })); // duplicate check finds a collision

    await expect(
      updateScore("score-1", "owner-1", "subscriber", { scoreDate: "2026-09-05" }, "req-1"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("allows the owner to update their own score", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: existingScore, error: null }))
      .mockReturnValueOnce(chainable({ data: { ...existingScore, score: 25 }, error: null }))
      .mockReturnValueOnce(chainable({ data: [{ ...existingScore, score: 25 }], error: null }));

    const result = await updateScore("score-1", "owner-1", "subscriber", { score: 25 }, "req-1");
    expect(result[0].score).toBe(25);
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "score.updated", reason: undefined }));
  });
});

describe("deleteScore", () => {
  it("throws forbidden when a non-admin tries to delete another subscriber's score", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: existingScore, error: null }));

    await expect(deleteScore("score-1", "someone-else", "subscriber", "req-1")).rejects.toMatchObject({ status: 403 });
  });

  it("allows the owner to delete their own score and audits the deletion", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: existingScore, error: null })) // fetchOwnedScore
      .mockReturnValueOnce(chainable({ error: null })) // delete
      .mockReturnValueOnce(chainable({ data: [], error: null })); // listScores

    const result = await deleteScore("score-1", "owner-1", "subscriber", "req-1");

    expect(result).toEqual([]);
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "score.deleted", entityId: "score-1" }));
  });
});

describe("listScores", () => {
  it("never surfaces more than the retained maximum, ranked by score_date regardless of row order", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `id-${i}`,
      user_id: "user-1",
      score: 20 + i,
      score_date: `2026-09-${String(1 + i * 3).padStart(2, "0")}`,
      created_at: "t",
      updated_at: "t",
    }));
    const shuffled = [rows[3], rows[0], rows[5], rows[1], rows[4], rows[2]];
    fromMock.mockReturnValueOnce(chainable({ data: shuffled, error: null }));

    const result = await listScores("user-1");

    expect(result).toHaveLength(5);
    expect(result.some((s) => s.id === "id-0")).toBe(false);
  });
});
