import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, storageFromMock } = vi.hoisted(() => ({ fromMock: vi.fn(), storageFromMock: vi.fn() }));
const recordAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: { from: fromMock, storage: { from: storageFromMock } },
}));

vi.mock("../src/modules/audit/audit.service.js", () => ({
  recordAudit: recordAuditMock,
}));

import { adminListWinners, approveWinner, getWinnerDetail, rejectWinner, uploadProof } from "../src/modules/winners/winners.service.js";

function chainable(result: { data?: unknown; error?: unknown; count?: number }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "order", "update", "delete", "insert", "in", "not"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.range = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function makeStorageMock() {
  return {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example.test/proof.png" }, error: null }),
  };
}

const winningMatch = { id: "match-1", draw_id: "draw-1", user_id: "owner-1", tier: 5, prize_amount_cents: 40_000 };

beforeEach(() => {
  fromMock.mockReset();
  storageFromMock.mockReset();
  storageFromMock.mockReturnValue(makeStorageMock());
  recordAuditMock.mockClear();
});

const validFile = { buffer: Buffer.from("x"), mimetype: "image/png", size: 1024, originalname: "proof.png" };

describe("uploadProof", () => {
  it("uploads proof when the winner's verification is pending, and audits it", async () => {
    const updated = { draw_match_id: "match-1", status: "submitted", proof_uploaded_at: "t", reviewed_at: null, rejection_reason: null };
    fromMock
      .mockReturnValueOnce(chainable({ data: winningMatch, error: null })) // loadWinningMatch
      .mockReturnValueOnce(chainable({ data: { status: "pending", proof_storage_path: null, rejection_reason: null }, error: null })) // loadVerification
      .mockReturnValueOnce(chainable({ data: updated, error: null })); // update

    const result = await uploadProof("owner-1", "match-1", validFile, "req-1");

    expect(result.status).toBe("submitted");
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "winner.proof_uploaded" }));
  });

  it("rejects a non-owner uploading proof for someone else's winning result", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: winningMatch, error: null }));

    await expect(uploadProof("someone-else", "match-1", validFile, "req-1")).rejects.toMatchObject({ status: 403 });
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("rejects uploading when proof is already submitted and awaiting review", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: winningMatch, error: null }))
      .mockReturnValueOnce(chainable({ data: { status: "submitted", proof_storage_path: "p", rejection_reason: null }, error: null }));

    await expect(uploadProof("owner-1", "match-1", validFile, "req-1")).rejects.toMatchObject({ status: 409 });
  });

  it("rejects uploading when the winner has already been approved", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: winningMatch, error: null }))
      .mockReturnValueOnce(chainable({ data: { status: "approved", proof_storage_path: "p", rejection_reason: null }, error: null }));

    await expect(uploadProof("owner-1", "match-1", validFile, "req-1")).rejects.toMatchObject({ status: 409 });
  });

  it("allows resubmission after rejection and removes the previous proof file", async () => {
    const storage = makeStorageMock();
    storageFromMock.mockReturnValue(storage);

    fromMock
      .mockReturnValueOnce(chainable({ data: winningMatch, error: null }))
      .mockReturnValueOnce(chainable({ data: { status: "rejected", proof_storage_path: "match-1/old.png", rejection_reason: "blurry" }, error: null }))
      .mockReturnValueOnce(chainable({ data: { draw_match_id: "match-1", status: "submitted", proof_uploaded_at: "t", reviewed_at: null, rejection_reason: null }, error: null }));

    await uploadProof("owner-1", "match-1", validFile, "req-1");

    expect(storage.remove).toHaveBeenCalledWith(["match-1/old.png"]);
  });

  it("Phase H: reports a conflict rather than silently succeeding when a concurrent upload already changed the status", async () => {
    const storage = makeStorageMock();
    storageFromMock.mockReturnValue(storage);

    fromMock
      .mockReturnValueOnce(chainable({ data: winningMatch, error: null })) // loadWinningMatch
      .mockReturnValueOnce(chainable({ data: { status: "pending", proof_storage_path: null, rejection_reason: null }, error: null })) // loadVerification
      .mockReturnValueOnce(chainable({ data: null, error: null })); // conditional update matched nothing (status moved on)

    await expect(uploadProof("owner-1", "match-1", validFile, "req-1")).rejects.toMatchObject({ status: 409 });
    expect(recordAuditMock).not.toHaveBeenCalled();
    // The file was already uploaded to storage before the lost race was discovered;
    // it must be cleaned up rather than left as an orphan in the bucket.
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect((storage.remove as ReturnType<typeof vi.fn>).mock.calls[0][0][0]).toMatch(/^match-1\//);
  });

  it("rejects a disallowed file type before touching storage", async () => {
    const storage = makeStorageMock();
    storageFromMock.mockReturnValue(storage);
    fromMock
      .mockReturnValueOnce(chainable({ data: winningMatch, error: null }))
      .mockReturnValueOnce(chainable({ data: { status: "pending", proof_storage_path: null, rejection_reason: null }, error: null }));

    await expect(uploadProof("owner-1", "match-1", { ...validFile, mimetype: "application/pdf" }, "req-1")).rejects.toMatchObject({ status: 400 });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects an oversized file before touching storage", async () => {
    const storage = makeStorageMock();
    storageFromMock.mockReturnValue(storage);
    fromMock
      .mockReturnValueOnce(chainable({ data: winningMatch, error: null }))
      .mockReturnValueOnce(chainable({ data: { status: "pending", proof_storage_path: null, rejection_reason: null }, error: null }));

    await expect(uploadProof("owner-1", "match-1", { ...validFile, size: 6 * 1024 * 1024 }, "req-1")).rejects.toMatchObject({ status: 400 });
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe("getWinnerDetail", () => {
  const matchWithContext = { ...winningMatch, draws: { period_start: "2026-09-01", period_end: "2026-09-30" }, profiles: { full_name: "Sam", email: "sam@example.com" } };

  it("returns the detail with a signed proof url for the owner", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: matchWithContext, error: null })) // loadWinningMatchWithContext
      .mockReturnValueOnce(chainable({ data: { status: "submitted", proof_storage_path: "match-1/p.png", rejection_reason: null }, error: null })) // loadVerification
      .mockReturnValueOnce(chainable({ data: { id: "payout-1", status: "pending" }, error: null })); // draw_payouts

    const detail = await getWinnerDetail("match-1", "owner-1", "subscriber");

    expect(detail.proofSignedUrl).toBe("https://signed.example.test/proof.png");
    expect(detail.payoutId).toBe("payout-1");
  });

  it("allows an admin to view another user's winner detail", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: matchWithContext, error: null }))
      .mockReturnValueOnce(chainable({ data: { status: "pending", proof_storage_path: null, rejection_reason: null }, error: null }))
      .mockReturnValueOnce(chainable({ data: null, error: null }));

    const detail = await getWinnerDetail("match-1", "admin-1", "admin");
    expect(detail.proofSignedUrl).toBeNull();
  });

  it("rejects a non-owner, non-admin viewer", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: matchWithContext, error: null }));

    await expect(getWinnerDetail("match-1", "someone-else", "subscriber")).rejects.toMatchObject({ status: 403 });
  });
});

describe("approveWinner / rejectWinner", () => {
  it("approves a submitted proof and audits it", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { status: "submitted" }, error: null }))
      .mockReturnValueOnce(chainable({ data: { id: "match-1" }, error: null })); // conditional update matched a row

    await approveWinner("admin-1", "match-1", "req-1");

    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "winner.verification_approved" }));
  });

  it("refuses to approve a winner with no proof submitted yet", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: { status: "pending" }, error: null }));

    await expect(approveWinner("admin-1", "match-1", "req-1")).rejects.toMatchObject({ status: 400 });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("refuses to approve a winner that is already approved", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: { status: "approved" }, error: null }));

    await expect(approveWinner("admin-1", "match-1", "req-1")).rejects.toMatchObject({ status: 400 });
  });

  it("Phase H: reports a conflict (not a silent success) when a concurrent request decides the same winner first", async () => {
    // Both requests read status="submitted" and pass the initial check, but only one's
    // conditional UPDATE (WHERE status = 'submitted') actually matches a row — the
    // second one is simulated here by the update returning no row.
    fromMock
      .mockReturnValueOnce(chainable({ data: { status: "submitted" }, error: null })) // initial read
      .mockReturnValueOnce(chainable({ data: null, error: null })); // conditional update matched nothing

    await expect(approveWinner("admin-1", "match-1", "req-1")).rejects.toMatchObject({ status: 409 });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("rejects a submitted proof with a reason and audits it", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { status: "submitted" }, error: null }))
      .mockReturnValueOnce(chainable({ data: { id: "match-1" }, error: null })); // conditional update matched a row

    await rejectWinner("admin-1", "match-1", "Screenshot is unreadable.", "req-1");

    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "winner.verification_rejected", newState: expect.objectContaining({ reason: "Screenshot is unreadable." }) }),
    );
  });

  it("refuses to reject a winner with no proof submitted yet", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: { status: "pending" }, error: null }));

    await expect(rejectWinner("admin-1", "match-1", "reason", "req-1")).rejects.toMatchObject({ status: 400 });
  });
});

describe("adminListWinners", () => {
  it("short-circuits without querying draw_matches when a verification-status filter matches nothing", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: [], error: null })); // winner_verifications filter query

    const result = await adminListWinners({ page: 1, pageSize: 20, verificationStatus: "approved" });

    expect(result).toEqual({ winners: [], total: 0 });
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("lists winners joined with verification and payout status", async () => {
    const matchRow = {
      id: "match-1",
      user_id: "owner-1",
      draw_id: "draw-1",
      tier: 5,
      prize_amount_cents: 40_000,
      draws: { period_start: "2026-09-01", period_end: "2026-09-30" },
      profiles: { full_name: "Sam", email: "sam@example.com" },
    };

    fromMock
      .mockReturnValueOnce(chainable({ data: [matchRow], error: null, count: 1 })) // draw_matches page
      .mockReturnValueOnce(chainable({ data: [{ draw_match_id: "match-1", status: "approved", rejection_reason: null }], error: null })) // verifications
      .mockReturnValueOnce(chainable({ data: [{ id: "payout-1", draw_match_id: "match-1", status: "pending" }], error: null })); // payouts

    const result = await adminListWinners({ page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.winners[0]).toMatchObject({ drawMatchId: "match-1", verificationStatus: "approved", payoutId: "payout-1", payoutStatus: "pending" });
  });
});
