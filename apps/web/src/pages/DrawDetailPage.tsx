import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { DrawDTO, DrawTierSummaryDTO } from "@digital-heroes/shared";
import { formatPrice } from "@digital-heroes/shared";
import { api } from "../api/client";

interface DrawDetailResponse {
  draw: DrawDTO;
  tiers: DrawTierSummaryDTO[];
}

const TIER_LABEL: Record<number, string> = { 5: "5-number match", 4: "4-number match", 3: "3-number match" };

function formatPeriod(draw: DrawDTO): string {
  const start = new Date(`${draw.periodStart}T00:00:00Z`);
  return start.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

export function DrawDetailPage() {
  const { id = "" } = useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["draw-detail", id],
    queryFn: () => api.get<DrawDetailResponse>(`/api/draws/${id}`, { auth: false }),
  });

  if (isLoading) return <div className="container section"><div className="spinner" role="status" aria-label="Loading draw" /></div>;
  if (isError || !data) return <div className="container section"><p className="form-error">Draw not found.</p></div>;

  const { draw, tiers } = data;

  return (
    <div className="container section">
      <span className="badge badge-active">Published</span>
      <h1 className="section-title">{formatPeriod(draw)} draw</h1>
      <p className="section-subtitle">
        Published {draw.publishedAt ? new Date(draw.publishedAt).toLocaleDateString() : "—"}.
      </p>

      <div className="card stack" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Winning numbers</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(draw.winningNumbers ?? []).map((n) => (
            <span
              key={n}
              style={{
                width: 44,
                height: 44,
                display: "grid",
                placeItems: "center",
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
                fontWeight: 700,
              }}
            >
              {n}
            </span>
          ))}
        </div>
      </div>

      <div className="grid-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 20 }}>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Prize pool</h3>
          <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>{formatPrice(draw.prizePoolCents)}</p>
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Jackpot rolled in</h3>
          <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>{formatPrice(draw.jackpotRolloverInCents)}</p>
          <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.85rem" }}>Added to this draw's 5-match prize.</p>
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Jackpot rolling forward</h3>
          <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>{formatPrice(draw.jackpotRolloverOutCents)}</p>
          <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.85rem" }}>
            {draw.jackpotRolloverOutCents > 0 ? "Carried to next month's draw (unclaimed)." : "No unclaimed jackpot."}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Tier breakdown</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Allocation</th>
              <th>Winners</th>
              <th>Total paid</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.tier}>
                <td>{TIER_LABEL[t.tier]}</td>
                <td>{formatPrice(t.allocationCents)}</td>
                <td>{t.winnerCount}</td>
                <td>{formatPrice(t.totalPaidCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tiers.every((t) => t.winnerCount === 0) && (
          <p style={{ color: "var(--color-text-muted)", marginTop: 12 }}>No winners this draw.</p>
        )}
      </div>
    </div>
  );
}
