import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type {
  CharityAnalyticsReportDTO,
  DrawsReportResponseDTO,
  OverviewReportDTO,
  SubscriptionAnalyticsReportDTO,
  WinnerAnalyticsReportDTO,
} from "@digital-heroes/shared";
import { formatPrice } from "@digital-heroes/shared";
import { api } from "../api/client";

const selectStyle: CSSProperties = {
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  padding: "8px 10px",
  color: "var(--color-text)",
  fontSize: "0.85rem",
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card stack" style={{ padding: 18 }}>
      <span style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function formatPeriod(row: { periodStart: string }): string {
  const start = new Date(`${row.periodStart}T00:00:00Z`);
  return start.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

export function AdminReportsPage() {
  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useQuery({
    queryKey: ["admin-reports-overview"],
    queryFn: () => api.get<OverviewReportDTO>("/api/reports/overview"),
  });

  // ---- Draw analytics: status filter + pagination ----
  const [drawStatus, setDrawStatus] = useState("published");
  const [drawPage, setDrawPage] = useState(1);
  const drawPageSize = 10;

  const { data: drawReport, isError: drawsError } = useQuery({
    queryKey: ["admin-reports-draws", drawStatus, drawPage],
    queryFn: () => api.get<DrawsReportResponseDTO>(`/api/reports/draws?status=${drawStatus}&page=${drawPage}&pageSize=${drawPageSize}`),
  });
  const draws = drawReport?.draws;
  const drawTotalPages = drawReport ? Math.max(1, Math.ceil(drawReport.total / drawPageSize)) : 1;

  // ---- Winner analytics: tier/verification/payout filters ----
  const [winnerTier, setWinnerTier] = useState("");
  const [winnerVerification, setWinnerVerification] = useState("");
  const [winnerPayout, setWinnerPayout] = useState("");

  const { data: winners, isError: winnersError } = useQuery({
    queryKey: ["admin-reports-winners", winnerTier, winnerVerification, winnerPayout],
    queryFn: () =>
      api.get<WinnerAnalyticsReportDTO>(
        `/api/reports/winners?${winnerTier ? `tier=${winnerTier}&` : ""}${winnerVerification ? `verificationStatus=${winnerVerification}&` : ""}${winnerPayout ? `payoutStatus=${winnerPayout}` : ""}`,
      ),
  });

  // ---- Charity reporting: optional period filter ----
  const [charityFrom, setCharityFrom] = useState("");
  const [charityTo, setCharityTo] = useState("");

  const { data: charities, isError: charitiesError } = useQuery({
    queryKey: ["admin-reports-charities", charityFrom, charityTo],
    queryFn: () =>
      api.get<CharityAnalyticsReportDTO>(`/api/reports/charities?${charityFrom ? `from=${charityFrom}&` : ""}${charityTo ? `to=${charityTo}` : ""}`),
  });

  const { data: subscriptions, isError: subscriptionsError } = useQuery({
    queryKey: ["admin-reports-subscriptions"],
    queryFn: () => api.get<SubscriptionAnalyticsReportDTO>("/api/reports/subscriptions"),
  });

  return (
    <div className="container section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="section-title">Reports</h1>
          <p className="section-subtitle" style={{ marginBottom: 0 }}>
            Operational overview computed from live records — never estimated.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link to="/admin" className="btn btn-ghost">
            Users
          </Link>
          <Link to="/admin/charities" className="btn btn-ghost">
            Charities
          </Link>
          <Link to="/admin/draws" className="btn btn-ghost">
            Draws
          </Link>
          <Link to="/admin/winners" className="btn btn-ghost">
            Winners
          </Link>
        </div>
      </div>

      {overviewLoading && <div className="spinner" role="status" aria-label="Loading reports" />}
      {overviewError && <p className="form-error">Could not load the overview report.</p>}

      {overview && (
        <div className="grid-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", margin: "20px 0 32px" }}>
          <StatCard label="Total users" value={overview.totalUsers} />
          <StatCard label="Active subscribers" value={overview.activeSubscribers} />
          <StatCard label="Total prize pool" value={formatPrice(overview.totalPrizePoolCents)} />
          <StatCard label="Total winners" value={overview.totalWinners} />
          <StatCard label="Total paid" value={formatPrice(overview.totalPaidCents)} />
          <StatCard label="Pending payouts" value={`${formatPrice(overview.pendingPayoutsCents)} (${overview.pendingPayoutsCount})`} />
          <StatCard label="Charity contributions" value={formatPrice(overview.totalCharityContributionsCents)} />
          <StatCard label="Independent donations" value={formatPrice(overview.totalIndependentDonationsCents)} />
          <StatCard label="Published draws" value={overview.publishedDraws} />
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Draw analytics</h2>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            Status
            <select
              value={drawStatus}
              onChange={(e) => {
                setDrawPage(1);
                setDrawStatus(e.target.value);
              }}
              style={selectStyle}
            >
              <option value="published">Published</option>
              <option value="simulated">Simulated</option>
              <option value="draft">Draft</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", margin: "8px 0 0" }}>
          Defaults to published draws only — a simulated result is a candidate, not a finalized financial fact.
        </p>

        {drawsError && <p className="form-error">Could not load draw analytics.</p>}
        {!drawsError && !draws && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
        {draws && draws.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>No draws match this filter.</p>}
        {draws && draws.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Eligible</th>
                  <th>Prize pool</th>
                  <th>Jackpot in</th>
                  <th>Jackpot out</th>
                  <th>5/4/3 winners</th>
                  <th>Total prizes</th>
                  <th>Paid</th>
                  <th>Pending</th>
                </tr>
              </thead>
              <tbody>
                {draws.map((d) => (
                  <tr key={d.drawId}>
                    <td>{formatPeriod(d)}</td>
                    <td style={{ textTransform: "capitalize" }}>{d.status}</td>
                    <td>{d.eligibleParticipants}</td>
                    <td>{formatPrice(d.prizePoolCents)}</td>
                    <td>{formatPrice(d.jackpotRolloverInCents)}</td>
                    <td>{formatPrice(d.jackpotRolloverOutCents)}</td>
                    <td>
                      {d.winnersByTier[5]}/{d.winnersByTier[4]}/{d.winnersByTier[3]}
                    </td>
                    <td>{formatPrice(d.totalPrizesCents)}</td>
                    <td>{formatPrice(d.paidCents)}</td>
                    <td>{formatPrice(d.pendingCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {drawReport && drawReport.total > drawPageSize && (
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
            <button className="btn btn-ghost" disabled={drawPage <= 1} onClick={() => setDrawPage((p) => p - 1)}>
              Previous
            </button>
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
              Page {drawPage} of {drawTotalPages}
            </span>
            <button className="btn btn-ghost" disabled={drawPage >= drawTotalPages} onClick={() => setDrawPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
      </div>

      <div className="grid-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", marginBottom: 24 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ margin: 0 }}>Winner analytics</h2>
            <Link to="/admin/winners" className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: "0.85rem" }}>
              Manage winners
            </Link>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
            <select value={winnerTier} onChange={(e) => setWinnerTier(e.target.value)} style={selectStyle}>
              <option value="">All tiers</option>
              <option value="5">5-match</option>
              <option value="4">4-match</option>
              <option value="3">3-match</option>
            </select>
            <select value={winnerVerification} onChange={(e) => setWinnerVerification(e.target.value)} style={selectStyle}>
              <option value="">All verification</option>
              <option value="pending">Proof required</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={winnerPayout} onChange={(e) => setWinnerPayout(e.target.value)} style={selectStyle}>
              <option value="">All payouts</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          {winnersError && <p className="form-error">Could not load winner analytics.</p>}
          {!winnersError && !winners && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
          {winners && (
            <table className="table">
              <tbody>
                <tr>
                  <th>Total winners</th>
                  <td>{winners.totalWinners}</td>
                </tr>
                <tr>
                  <th>5 / 4 / 3-match</th>
                  <td>
                    {winners.winnersByTier[5]} / {winners.winnersByTier[4]} / {winners.winnersByTier[3]}
                  </td>
                </tr>
                <tr>
                  <th>Total prize liability</th>
                  <td>{formatPrice(winners.totalPrizeLiabilityCents)}</td>
                </tr>
                <tr>
                  <th>Total paid</th>
                  <td>{formatPrice(winners.totalPaidCents)}</td>
                </tr>
                <tr>
                  <th>Total pending</th>
                  <td>{formatPrice(winners.totalPendingCents)}</td>
                </tr>
                <tr>
                  <th>Approved verifications</th>
                  <td>{winners.totalApprovedVerification}</td>
                </tr>
                <tr>
                  <th>Rejected verifications</th>
                  <td>{winners.totalRejectedVerification}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Subscription analytics</h2>
          {subscriptionsError && <p className="form-error">Could not load subscription analytics.</p>}
          {!subscriptionsError && !subscriptions && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
          {subscriptions && (
            <table className="table">
              <tbody>
                <tr>
                  <th>Total</th>
                  <td>{subscriptions.totalSubscriptions}</td>
                </tr>
                <tr>
                  <th>Active</th>
                  <td>{subscriptions.activeSubscriptions}</td>
                </tr>
                <tr>
                  <th>Canceled</th>
                  <td>{subscriptions.canceledSubscriptions}</td>
                </tr>
                <tr>
                  <th>Lapsed</th>
                  <td>{subscriptions.lapsedSubscriptions}</td>
                </tr>
                <tr>
                  <th>Monthly plans</th>
                  <td>{subscriptions.monthlyPlanCount}</td>
                </tr>
                <tr>
                  <th>Yearly plans</th>
                  <td>{subscriptions.yearlyPlanCount}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Charity reporting</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
              From
              <input type="date" value={charityFrom} onChange={(e) => setCharityFrom(e.target.value)} style={{ ...selectStyle, padding: "6px 8px" }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
              To
              <input type="date" value={charityTo} onChange={(e) => setCharityTo(e.target.value)} style={{ ...selectStyle, padding: "6px 8px" }} />
            </label>
          </div>
        </div>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          Subscription charity contributions and independent donations are always kept separate — never combined into one figure.
        </p>
        {charitiesError && <p className="form-error">Could not load charity reporting.</p>}
        {!charitiesError && !charities && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
        {charities && (
          <>
            <div className="grid-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 16 }}>
              <StatCard label="Subscription contributions" value={formatPrice(charities.totalContributionsCents)} />
              <StatCard label="Independent donations" value={formatPrice(charities.totalIndependentDonationsCents)} />
              <StatCard label="Average contribution %" value={`${charities.averageContributionPercent.toFixed(1)}%`} />
            </div>
            {charities.byCharity.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)" }}>No charity contributions recorded yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Charity</th>
                      <th>Total contributions</th>
                      <th>Supporters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charities.byCharity.map((c) => (
                      <tr key={c.charityId}>
                        <td>{c.name}</td>
                        <td>{formatPrice(c.totalContributionCents)}</td>
                        <td>{c.supporterCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
