import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { DrawDTO } from "@digital-heroes/shared";
import { formatPrice } from "@digital-heroes/shared";
import { api } from "../api/client";

const STATUS_LABEL: Record<DrawDTO["status"], string> = {
  draft: "Draft",
  simulated: "Simulated",
  published: "Published",
};

function formatPeriod(draw: DrawDTO): string {
  const start = new Date(`${draw.periodStart}T00:00:00Z`);
  return start.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

export function DrawsPage() {
  const { data: draws, isLoading, isError } = useQuery({
    queryKey: ["published-draws"],
    queryFn: () => api.get<DrawDTO[]>("/api/draws", { auth: false }),
  });

  return (
    <div className="container section">
      <h1 className="section-title">Monthly draws</h1>
      <p className="section-subtitle">
        Every month, subscribers with a complete set of retained Stableford scores are entered into a draw for a
        share of the prize pool. Winning numbers are generated using a frequency-weighted random draw over eligible
        participants' scores.
      </p>

      {isLoading && <div className="spinner" role="status" aria-label="Loading draws" />}
      {isError && <p className="form-error">Could not load draws right now. Please try again.</p>}

      {draws && draws.length === 0 && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No draws have been published yet.</p>
          <p style={{ margin: 0 }}>Check back after the next monthly draw is published.</p>
        </div>
      )}

      {draws && draws.length > 0 && (
        <div className="plan-grid">
          {draws.map((draw) => (
            <Link key={draw.id} to={`/draws/${draw.id}`} className="card plan-card stack" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="badge badge-active">{STATUS_LABEL[draw.status]}</span>
              <h3 style={{ margin: 0 }}>{formatPeriod(draw)}</h3>
              <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Prize pool: {formatPrice(draw.prizePoolCents)}</p>
              {draw.jackpotRolloverInCents > 0 && (
                <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Jackpot rollover: {formatPrice(draw.jackpotRolloverInCents)}</p>
              )}
              {draw.winningNumbers && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {draw.winningNumbers.map((n) => (
                    <span key={n} className="badge badge-active" style={{ minWidth: 28, textAlign: "center" }}>
                      {n}
                    </span>
                  ))}
                </div>
              )}
              <span className="btn btn-ghost">View result</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
