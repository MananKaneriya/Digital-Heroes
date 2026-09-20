import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
const resolveMatchIdsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: { from: fromMock },
}));

vi.mock("../src/modules/winners/winners.service.js", () => ({
  resolveMatchIdsForStatusFilters: resolveMatchIdsMock,
}));

import { getCharityAnalytics, getDrawAnalytics, getWinnerAnalytics } from "../src/modules/reports/reports.service.js";

function chainable(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "order", "gte", "lte", "in", "not"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.range = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  fromMock.mockReset();
  resolveMatchIdsMock.mockReset();
  resolveMatchIdsMock.mockResolvedValue(undefined);
});

describe("getDrawAnalytics", () => {
  it("defaults to filtering by status=published on both the count and list queries", async () => {
    const countBuilder = chainable({ count: 0, error: null });
    const drawsBuilder = chainable({ data: [], error: null });
    fromMock.mockReturnValueOnce(countBuilder).mockReturnValueOnce(drawsBuilder);

    await getDrawAnalytics({ status: "published", page: 1, pageSize: 20 });

    expect(countBuilder.eq).toHaveBeenCalledWith("status", "published");
    expect(drawsBuilder.eq).toHaveBeenCalledWith("status", "published");
  });

  it("does not filter by status when status=all is requested", async () => {
    const countBuilder = chainable({ count: 0, error: null });
    const drawsBuilder = chainable({ data: [], error: null });
    fromMock.mockReturnValueOnce(countBuilder).mockReturnValueOnce(drawsBuilder);

    await getDrawAnalytics({ status: "all", page: 1, pageSize: 20 });

    expect(countBuilder.eq).not.toHaveBeenCalled();
    expect(drawsBuilder.eq).not.toHaveBeenCalled();
  });

  it("translates page/pageSize into the correct range and returns pagination metadata", async () => {
    const countBuilder = chainable({ count: 45, error: null });
    const drawsBuilder = chainable({ data: [], error: null });
    fromMock.mockReturnValueOnce(countBuilder).mockReturnValueOnce(drawsBuilder);

    const result = await getDrawAnalytics({ status: "published", page: 3, pageSize: 10 });

    expect(drawsBuilder.range).toHaveBeenCalledWith(20, 29);
    expect(result).toEqual({ draws: [], total: 45, page: 3, pageSize: 10 });
  });

  it("applies drawId and period filters to both queries", async () => {
    const countBuilder = chainable({ count: 0, error: null });
    const drawsBuilder = chainable({ data: [], error: null });
    fromMock.mockReturnValueOnce(countBuilder).mockReturnValueOnce(drawsBuilder);

    await getDrawAnalytics({ status: "all", drawId: "11111111-1111-1111-1111-111111111111", from: "2026-01-01", to: "2026-12-31", page: 1, pageSize: 20 });

    expect(drawsBuilder.eq).toHaveBeenCalledWith("id", "11111111-1111-1111-1111-111111111111");
    expect(drawsBuilder.gte).toHaveBeenCalledWith("period_start", "2026-01-01");
    expect(drawsBuilder.lte).toHaveBeenCalledWith("period_start", "2026-12-31");
  });

  it("aggregates entries/matches/payouts for the returned page of draws", async () => {
    const countBuilder = chainable({ count: 1, error: null });
    const draw = {
      id: "draw-1",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      status: "published",
      prize_pool_cents: 100_000,
      jackpot_rollover_in_cents: 0,
      jackpot_rollover_out_cents: 0,
      winning_numbers: [1, 2, 3, 4, 5],
    };
    const drawsBuilder = chainable({ data: [draw], error: null });

    fromMock
      .mockReturnValueOnce(countBuilder)
      .mockReturnValueOnce(drawsBuilder)
      .mockReturnValueOnce(chainable({ data: [{ draw_id: "draw-1" }, { draw_id: "draw-1" }], error: null })) // draw_entries
      .mockReturnValueOnce(chainable({ data: [{ id: "m1", draw_id: "draw-1", tier: 5, prize_amount_cents: 40_000 }], error: null })) // draw_matches
      .mockReturnValueOnce(chainable({ data: [{ draw_match_id: "m1", status: "paid", amount_cents: 40_000 }], error: null })); // draw_payouts

    const result = await getDrawAnalytics({ status: "published", page: 1, pageSize: 20 });

    expect(result.draws).toHaveLength(1);
    expect(result.draws[0].eligibleParticipants).toBe(2);
    expect(result.draws[0].winnersByTier).toEqual({ 5: 1, 4: 0, 3: 0 });
    expect(result.draws[0].paidCents).toBe(40_000);
  });
});

describe("getWinnerAnalytics", () => {
  it("short-circuits without querying draw_matches when the period filter matches no published draws", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: [], error: null })); // draws for period filter

    const result = await getWinnerAnalytics({ from: "2020-01-01", to: "2020-01-31" });

    expect(result.totalWinners).toBe(0);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(resolveMatchIdsMock).not.toHaveBeenCalled();
  });

  it("short-circuits without querying draw_matches when a status filter matches nothing", async () => {
    resolveMatchIdsMock.mockResolvedValueOnce([]);

    const result = await getWinnerAnalytics({ verificationStatus: "approved" });

    expect(result.totalWinners).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("applies tier and drawId filters directly, alongside the resolved status match-id filter", async () => {
    resolveMatchIdsMock.mockResolvedValueOnce(["m1"]);
    const matchBuilder = chainable({ data: [{ id: "m1", tier: 5, prize_amount_cents: 40_000 }], error: null });

    fromMock
      .mockReturnValueOnce(matchBuilder) // draw_matches
      .mockReturnValueOnce(chainable({ data: [{ draw_match_id: "m1", status: "paid", amount_cents: 40_000 }], error: null })) // payouts
      .mockReturnValueOnce(chainable({ data: [{ status: "approved" }], error: null })); // verifications

    const result = await getWinnerAnalytics({ tier: 5, drawId: "11111111-1111-1111-1111-111111111111", verificationStatus: "approved" });

    expect(matchBuilder.eq).toHaveBeenCalledWith("tier", 5);
    expect(matchBuilder.eq).toHaveBeenCalledWith("draw_id", "11111111-1111-1111-1111-111111111111");
    expect(matchBuilder.in).toHaveBeenCalledWith("id", ["m1"]);
    expect(result.totalWinners).toBe(1);
    expect(result.totalPaidCents).toBe(40_000);
    expect(result.totalApprovedVerification).toBe(1);
  });
});

describe("getCharityAnalytics", () => {
  it("applies the from/to range to contributions (by period_end) and donations (by created_at) independently", async () => {
    // Source order: contributionsBuilder and donationsBuilder are constructed (and so call
    // supabaseAdmin.from) before the Promise.all — "charities" and "charity_selections" are
    // requested afterward, inside the Promise.all array itself.
    const contributionsBuilder = chainable({ data: [], error: null });
    const donationsBuilder = chainable({ data: [], error: null });

    fromMock
      .mockReturnValueOnce(contributionsBuilder) // charity_contributions
      .mockReturnValueOnce(donationsBuilder) // independent_donations
      .mockReturnValueOnce(chainable({ data: [], error: null })) // charities
      .mockReturnValueOnce(chainable({ data: [], error: null })); // charity_selections

    await getCharityAnalytics({ from: "2026-01-01", to: "2026-06-30" });

    expect(contributionsBuilder.gte).toHaveBeenCalledWith("period_end", "2026-01-01");
    expect(contributionsBuilder.lte).toHaveBeenCalledWith("period_end", "2026-06-30");
    expect(donationsBuilder.gte).toHaveBeenCalledWith("created_at", "2026-01-01");
    expect(donationsBuilder.lte).toHaveBeenCalledWith("created_at", "2026-06-30");
  });

  it("returns zeroed totals with no filters and no data", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: [], error: null })) // charity_contributions
      .mockReturnValueOnce(chainable({ data: [], error: null })) // independent_donations
      .mockReturnValueOnce(chainable({ data: [], error: null })) // charities
      .mockReturnValueOnce(chainable({ data: [], error: null })); // charity_selections

    const result = await getCharityAnalytics({});
    expect(result).toEqual({ totalContributionsCents: 0, totalIndependentDonationsCents: 0, averageContributionPercent: 0, byCharity: [] });
  });
});
