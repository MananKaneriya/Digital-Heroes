import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CharityContributionDTO, CharitySelectionDTO } from "@digital-heroes/shared";
import { formatPrice } from "@digital-heroes/shared";
import { api } from "../api/client";

export function CharitySelectionSection() {
  const { data: selection, isLoading: selectionLoading } = useQuery({
    queryKey: ["my-charity-selection"],
    queryFn: () => api.get<CharitySelectionDTO | null>("/api/charities/me/selection"),
  });

  const { data: contributions, isLoading: contributionsLoading } = useQuery({
    queryKey: ["my-charity-contributions"],
    queryFn: () => api.get<CharityContributionDTO[]>("/api/charities/me/contributions"),
  });

  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Charity</h2>

      {selectionLoading && <p style={{ color: "var(--color-text-muted)" }}>Loading your charity selection…</p>}

      {!selectionLoading && !selection && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>You haven't selected a charity yet.</p>
          <Link to="/charities" className="btn btn-primary" style={{ marginTop: 12 }}>
            Choose a charity
          </Link>
        </div>
      )}

      {selection && (
        <>
          <p style={{ margin: 0 }}>
            Supporting <strong>{selection.charityName}</strong> with <strong>{selection.contributionPercent}%</strong> of your subscription.
          </p>
          <Link to="/charities" className="btn btn-ghost">
            Change charity or contribution
          </Link>
        </>
      )}

      {contributions && contributions.length > 0 && (
        <div className="stack" style={{ marginTop: 8 }}>
          <p style={{ margin: 0, fontWeight: 600, textTransform: "uppercase", fontSize: "0.78rem", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>
            Contribution history
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Charity</th>
                <th>Contribution</th>
              </tr>
            </thead>
            <tbody>
              {contributions.slice(0, 5).map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.periodEnd).toLocaleDateString()}</td>
                  <td>{c.charityName}</td>
                  <td>{formatPrice(c.contributionCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!contributionsLoading && contributions && contributions.length === 0 && selection && (
        <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.85rem" }}>
          Your first contribution will be recorded at your next billing period.
        </p>
      )}
    </div>
  );
}
