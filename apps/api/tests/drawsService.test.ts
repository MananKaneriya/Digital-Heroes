import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
const recordAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: { from: fromMock },
}));

vi.mock("../src/modules/audit/audit.service.js", () => ({
  recordAudit: recordAuditMock,
}));

import { adminGetDrawDetail, publishDraw, simulateDraw, updatePayoutStatus } from "../src/modules/draws/draws.service.js";

function chainable(result: { data?: unknown; error?: unknown; count?: number }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "order", "update", "delete", "insert", "upsert", "limit", "gte", "gt", "lt", "in", "not"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  fromMock.mockReset();
  recordAuditMock.mockClear();
});

describe("simulateDraw", () => {
  it("refuses to re-simulate a draw that has already been published", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: { id: "draw-1", status: "published" }, error: null }));

    await expect(simulateDraw("admin-1", { month: "2026-10", prizePoolCents: 100_000 }, "req-1")).rejects.toMatchObject({
      status: 409,
    });
    // Nothing beyond the existence check should have been queried.
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("includes only active subscribers with exactly 5 retained scores, excluding canceled, lapsed, and incomplete-score participants", async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();

    const subscriptions = [
      { user_id: "user-active", status: "active", current_period_end: future }, // eligible
      { user_id: "user-canceled", status: "canceled", current_period_end: future }, // excluded: not an access-granting status
      { user_id: "user-lapsed", status: "active", current_period_end: past }, // excluded: period already ended
      { user_id: "user-few-scores", status: "active", current_period_end: future }, // excluded: only 3 scores
    ];

    const scoreRow = (userId: string, n: number) => ({ id: `${userId}-score-${n}`, user_id: userId, score: 10 + n, score_date: `2026-09-0${n}` });
    const golfScores = [
      ...[1, 2, 3, 4, 5].map((n) => scoreRow("user-active", n)),
      ...[1, 2, 3, 4, 5].map((n) => scoreRow("user-canceled", n)),
      ...[1, 2, 3, 4, 5].map((n) => scoreRow("user-lapsed", n)),
      ...[1, 2, 3].map((n) => scoreRow("user-few-scores", n)),
    ];

    const entriesInsert = chainable({ error: null });

    fromMock
      .mockReturnValueOnce(chainable({ data: null, error: null })) // no existing draw for this period
      .mockReturnValueOnce(chainable({ data: null, error: null })) // no prior published draw -> no jackpot rollover
      .mockReturnValueOnce(chainable({ data: subscriptions, error: null })) // subscriptions
      .mockReturnValueOnce(chainable({ data: golfScores, error: null })) // golf_scores
      .mockReturnValueOnce(
        chainable({ data: { id: "draw-1", status: "simulated", period_start: "2026-09-01", period_end: "2026-09-30" }, error: null }),
      ) // upsert draws
      .mockReturnValueOnce(chainable({ error: null })) // delete draw_matches
      .mockReturnValueOnce(chainable({ error: null })) // delete draw_entries
      .mockReturnValueOnce(entriesInsert) // insert draw_entries
      .mockReturnValueOnce(chainable({ error: null })); // insert draw_matches

    await simulateDraw("admin-1", { month: "2026-09", prizePoolCents: 100_000, seed: 1 }, "req-1");

    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ newState: expect.objectContaining({ participantCount: 1 }) }));

    const insertedEntries = (entriesInsert.insert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ user_id: string }>;
    expect(insertedEntries).toHaveLength(1);
    expect(insertedEntries[0].user_id).toBe("user-active");
  });

  it("never queries independent_donations when resolving eligibility (donations must not affect draw entry)", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce(chainable({ data: [], error: null }))
      .mockReturnValueOnce(
        chainable({ data: { id: "draw-1", status: "simulated", period_start: "2026-09-01", period_end: "2026-09-30" }, error: null }),
      )
      .mockReturnValueOnce(chainable({ error: null }))
      .mockReturnValueOnce(chainable({ error: null }));

    await simulateDraw("admin-1", { month: "2026-09", prizePoolCents: 100_000, seed: 1 }, "req-1");

    const queriedTables = fromMock.mock.calls.map((call) => call[0]);
    expect(queriedTables).not.toContain("independent_donations");
  });

  it("persists the RNG method and seed on the draw row, and rolls the prior jackpot into this draw's 5-match allocation", async () => {
    const drawUpsert = chainable({
      data: { id: "draw-2", status: "simulated", period_start: "2026-10-01", period_end: "2026-10-31" },
      error: null,
    });

    fromMock
      .mockReturnValueOnce(chainable({ data: null, error: null })) // no existing draw for this period
      .mockReturnValueOnce(chainable({ data: { jackpot_rollover_out_cents: 5_000 }, error: null })) // prior published draw left a jackpot
      .mockReturnValueOnce(chainable({ data: [], error: null })) // subscriptions: nobody active
      .mockReturnValueOnce(drawUpsert) // upsert draws
      .mockReturnValueOnce(chainable({ error: null })) // delete draw_matches
      .mockReturnValueOnce(chainable({ error: null })); // delete draw_entries

    await simulateDraw("admin-1", { month: "2026-10", prizePoolCents: 100_000, seed: 777 }, "req-1");

    const upsertArgs = (drawUpsert.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(upsertArgs.rng_method).toBe("frequency-weighted-without-replacement-v1");
    expect(upsertArgs.rng_seed).toBe("777");
    expect(upsertArgs.jackpot_rollover_in_cents).toBe(5_000);
  });

  it("simulates a fresh draw with no eligible participants and records the audit entry", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: null, error: null })) // no existing draw for this period
      .mockReturnValueOnce(chainable({ data: null, error: null })) // no prior published draw -> no jackpot rollover
      .mockReturnValueOnce(chainable({ data: [], error: null })) // subscriptions: nobody active
      .mockReturnValueOnce(
        chainable({
          data: { id: "draw-1", status: "simulated", period_start: "2026-10-01", period_end: "2026-10-31" },
          error: null,
        }),
      ) // upsert draws
      .mockReturnValueOnce(chainable({ error: null })) // delete draw_matches
      .mockReturnValueOnce(chainable({ error: null })); // delete draw_entries

    const draw = await simulateDraw("admin-1", { month: "2026-10", prizePoolCents: 100_000, seed: 42 }, "req-1");

    expect(draw.status).toBe("simulated");
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "draw.simulated", newState: expect.objectContaining({ participantCount: 0 }) }),
    );
  });
});

describe("publishDraw", () => {
  it("refuses to publish a draw that hasn't been simulated yet", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: { id: "draw-1", status: "draft" }, error: null }));

    await expect(publishDraw("admin-1", "draw-1", "req-1")).rejects.toMatchObject({ status: 400 });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("refuses to publish a draw that is already published", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: { id: "draw-1", status: "published" }, error: null }));

    await expect(publishDraw("admin-1", "draw-1", "req-1")).rejects.toMatchObject({ status: 409 });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("publishes a simulated draw and creates a pending payout for every winning match", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { id: "draw-1", status: "simulated" }, error: null })) // load draw
      .mockReturnValueOnce(chainable({ data: { id: "draw-1", status: "published" }, error: null })) // update -> published
      .mockReturnValueOnce(
        chainable({
          data: [
            { id: "match-1", user_id: "user-1", prize_amount_cents: 40_000 },
            { id: "match-2", user_id: "user-2", prize_amount_cents: 25_000 },
          ],
          error: null,
        }),
      ) // winning matches
      .mockReturnValueOnce(chainable({ error: null })); // insert draw_payouts

    const draw = await publishDraw("admin-1", "draw-1", "req-1");

    expect(draw.status).toBe("published");
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "draw.published", newState: expect.objectContaining({ winnerPayoutsCreated: 2 }) }),
    );
  });

  it("publishes cleanly with zero winners (no payout rows to insert)", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { id: "draw-1", status: "simulated" }, error: null }))
      .mockReturnValueOnce(chainable({ data: { id: "draw-1", status: "published" }, error: null }))
      .mockReturnValueOnce(chainable({ data: [], error: null })); // no winning matches -> no insert call follows

    await publishDraw("admin-1", "draw-1", "req-1");

    expect(fromMock).toHaveBeenCalledTimes(3);
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ newState: expect.objectContaining({ winnerPayoutsCreated: 0 }) }));
  });
});

describe("updatePayoutStatus", () => {
  it("marks a payout paid, stamps processed_at, and records the method and audit entry", async () => {
    const payoutUpdate = chainable({ error: null });

    fromMock
      .mockReturnValueOnce(chainable({ data: { id: "payout-1", status: "pending", method: null }, error: null })) // load existing
      .mockReturnValueOnce(payoutUpdate); // update

    await updatePayoutStatus("admin-1", "payout-1", "paid", "req-1", "bank_transfer");

    const updateArgs = (payoutUpdate.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(updateArgs.status).toBe("paid");
    expect(updateArgs.method).toBe("bank_transfer");
    expect(typeof updateArgs.processed_at).toBe("string");
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "draw.payout_recorded", newState: expect.objectContaining({ status: "paid" }) }));
  });

  it("throws not found for a nonexistent payout", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: null, error: null }));

    await expect(updatePayoutStatus("admin-1", "missing", "paid", "req-1")).rejects.toMatchObject({ status: 404 });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });
});

describe("adminGetDrawDetail", () => {
  it("attaches each winning match's payout id and status, and leaves non-winning matches without one", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { id: "draw-1", status: "published" }, error: null })) // load draw
      .mockReturnValueOnce(
        chainable({
          data: [
            { id: "match-1", user_id: "user-1", match_count: 5, tier: 5, prize_amount_cents: 40_000, profiles: { full_name: "Sam", email: "sam@example.com" } },
            { id: "match-2", user_id: "user-2", match_count: 1, tier: null, prize_amount_cents: 0, profiles: { full_name: "Alex", email: "alex@example.com" } },
          ],
          error: null,
        }),
      ) // draw_matches
      .mockReturnValueOnce(chainable({ data: [{ id: "payout-1", draw_match_id: "match-1", status: "pending" }], error: null })) // draw_payouts
      .mockReturnValueOnce(chainable({ count: 2, error: null })); // draw_entries count

    const result = await adminGetDrawDetail("draw-1");

    const winning = result.matches.find((m) => m.userId === "user-1")!;
    const nonWinning = result.matches.find((m) => m.userId === "user-2")!;
    expect(winning.payoutId).toBe("payout-1");
    expect(winning.payoutStatus).toBe("pending");
    expect(nonWinning.payoutId).toBeNull();
    expect(nonWinning.payoutStatus).toBeNull();
  });

  it("skips the payout lookup entirely when the draw has no matches yet", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { id: "draw-1", status: "simulated" }, error: null }))
      .mockReturnValueOnce(chainable({ data: [], error: null })) // no matches
      .mockReturnValueOnce(chainable({ count: 0, error: null })); // draw_entries count

    const result = await adminGetDrawDetail("draw-1");

    expect(result.matches).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(3); // no draw_payouts query when matchIds is empty
  });
});
