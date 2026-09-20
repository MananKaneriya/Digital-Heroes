import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DrawAdminMatchDTO, DrawDTO } from "@digital-heroes/shared";
import { formatPrice } from "@digital-heroes/shared";
import { api, ApiClientError } from "../api/client";

interface AdminDrawDetailResponse {
  draw: DrawDTO;
  participantCount: number;
  matches: DrawAdminMatchDTO[];
}

const STATUS_LABEL: Record<DrawDTO["status"], string> = {
  draft: "Draft",
  simulated: "Simulated",
  published: "Published",
};

function formatPeriod(draw: DrawDTO): string {
  const start = new Date(`${draw.periodStart}T00:00:00Z`);
  return start.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function AdminDrawsPage() {
  const queryClient = useQueryClient();
  const [managingId, setManagingId] = useState<string | null>(null);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [simulateError, setSimulateError] = useState<string | null>(null);
  const [simulateForm, setSimulateForm] = useState({ month: currentMonthValue(), prizePool: "1000", seed: "" });

  const { data: draws, isLoading, isError } = useQuery({
    queryKey: ["admin-draws"],
    queryFn: () => api.get<DrawDTO[]>("/api/draws/admin"),
  });

  const simulateMutation = useMutation({
    mutationFn: (input: { month: string; prizePoolCents: number; seed?: number }) => api.post<DrawDTO>("/api/draws/admin/simulate", input),
    onSuccess: (draw) => {
      queryClient.invalidateQueries({ queryKey: ["admin-draws"] });
      setSimulateOpen(false);
      setSimulateError(null);
      setManagingId(draw.id);
    },
    onError: (err) => setSimulateError(err instanceof ApiClientError ? err.message : "Could not simulate the draw."),
  });

  function submitSimulate(e: FormEvent) {
    e.preventDefault();
    const dollars = Number(simulateForm.prizePool);
    if (!/^\d{4}-\d{2}$/.test(simulateForm.month)) {
      setSimulateError("Choose a valid month.");
      return;
    }
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setSimulateError("Enter a prize pool amount greater than zero.");
      return;
    }
    const seedValue = simulateForm.seed.trim() ? Number(simulateForm.seed) : undefined;
    simulateMutation.mutate({ month: simulateForm.month, prizePoolCents: Math.round(dollars * 100), seed: seedValue });
  }

  return (
    <div className="container section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="section-title">Draws</h1>
          <p className="section-subtitle" style={{ marginBottom: 0 }}>
            Configure, simulate, and publish the monthly draw.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link to="/admin" className="btn btn-ghost">
            Users
          </Link>
          <Link to="/admin/charities" className="btn btn-ghost">
            Charities
          </Link>
          <Link to="/admin/winners" className="btn btn-ghost">
            Winners
          </Link>
          <Link to="/admin/reports" className="btn btn-ghost">
            Reports
          </Link>
        </div>
      </div>

      <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => setSimulateOpen((v) => !v)}>
        {simulateOpen ? "Cancel" : "Simulate a draw"}
      </button>

      {simulateOpen && (
        <form className="card stack" onSubmit={submitSimulate} noValidate style={{ marginBottom: 24, maxWidth: 520 }}>
          <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.9rem" }}>
            Simulating the same month again replaces its candidate result — safe to repeat until published.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label htmlFor="sim-month">Month</label>
              <input
                id="sim-month"
                type="month"
                value={simulateForm.month}
                onChange={(e) => setSimulateForm((f) => ({ ...f, month: e.target.value }))}
              />
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label htmlFor="sim-pool">Prize pool (USD)</label>
              <input
                id="sim-pool"
                type="number"
                min={1}
                step="1"
                value={simulateForm.prizePool}
                onChange={(e) => setSimulateForm((f) => ({ ...f, prizePool: e.target.value }))}
              />
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label htmlFor="sim-seed">Seed (optional)</label>
              <input
                id="sim-seed"
                type="number"
                placeholder="random"
                value={simulateForm.seed}
                onChange={(e) => setSimulateForm((f) => ({ ...f, seed: e.target.value }))}
              />
            </div>
          </div>
          {simulateError && <div className="form-error">{simulateError}</div>}
          <button type="submit" className="btn btn-primary" disabled={simulateMutation.isPending} style={{ alignSelf: "flex-start" }}>
            {simulateMutation.isPending ? "Simulating…" : "Run simulation"}
          </button>
        </form>
      )}

      {isLoading && <div className="spinner" role="status" aria-label="Loading draws" />}
      {isError && <p className="form-error">Could not load draws.</p>}

      {draws && draws.length === 0 && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No draws yet. Simulate the first one above.</p>
        </div>
      )}

      {draws && draws.length > 0 && (
        <div className="card" style={{ overflowX: "auto", marginBottom: 24 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Status</th>
                <th>Prize pool</th>
                <th>Jackpot in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {draws.map((d) => (
                <tr key={d.id}>
                  <td>{formatPeriod(d)}</td>
                  <td>
                    <span className={`badge badge-${d.status === "published" ? "active" : d.status === "simulated" ? "past_due" : "canceled"}`}>
                      {STATUS_LABEL[d.status]}
                    </span>
                  </td>
                  <td>{formatPrice(d.prizePoolCents)}</td>
                  <td>{formatPrice(d.jackpotRolloverInCents)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost" onClick={() => setManagingId(managingId === d.id ? null : d.id)}>
                      {managingId === d.id ? "Close" : "Manage"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {managingId && <DrawManagementPanel drawId={managingId} />}
    </div>
  );
}

function DrawManagementPanel({ drawId }: { drawId: string }) {
  const queryClient = useQueryClient();
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [payoutMethods, setPayoutMethods] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["admin-draw-detail", drawId],
    queryFn: () => api.get<AdminDrawDetailResponse>(`/api/draws/admin/${drawId}`),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["admin-draws"] });
    queryClient.invalidateQueries({ queryKey: ["admin-draw-detail", drawId] });
  }

  const publishMutation = useMutation({
    mutationFn: () => api.post<DrawDTO>(`/api/draws/admin/${drawId}/publish`),
    onSuccess: () => {
      invalidateAll();
      setConfirmingPublish(false);
    },
    onError: (err) => setMutationError(err instanceof ApiClientError ? err.message : "Could not publish the draw."),
  });

  const payoutMutation = useMutation({
    mutationFn: (params: { payoutId: string; status: "paid" | "failed"; method?: string }) =>
      api.patch(`/api/draws/admin/payouts/${params.payoutId}`, { status: params.status, method: params.method || undefined }),
    onSuccess: invalidateAll,
    onError: (err) => setMutationError(err instanceof ApiClientError ? err.message : "Could not update the payout."),
  });

  if (isLoading || !data) return <div className="spinner" role="status" aria-label="Loading draw detail" />;
  const { draw, participantCount, matches } = data;
  const winners = matches.filter((m) => m.tier !== null);

  return (
    <div className="card stack" style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>{formatPeriod(draw)}</h2>
        <span className={`badge badge-${draw.status === "published" ? "active" : draw.status === "simulated" ? "past_due" : "canceled"}`}>
          {STATUS_LABEL[draw.status]}
        </span>
      </div>

      {mutationError && <div className="form-error">{mutationError}</div>}

      <div className="grid-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <p style={{ margin: 0 }}>
          <strong>Eligible participants:</strong> {participantCount}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Prize pool:</strong> {formatPrice(draw.prizePoolCents)}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Jackpot in:</strong> {formatPrice(draw.jackpotRolloverInCents)}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Jackpot out:</strong> {formatPrice(draw.jackpotRolloverOutCents)}
        </p>
      </div>

      {draw.winningNumbers && (
        <div>
          <strong>Winning numbers:</strong>{" "}
          {draw.winningNumbers.map((n) => (
            <span key={n} className="badge badge-active" style={{ marginRight: 6 }}>
              {n}
            </span>
          ))}
          <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginLeft: 8 }}>
            ({draw.rngMethod}, seed {draw.rngSeed})
          </span>
        </div>
      )}

      {draw.status === "simulated" && (
        <div>
          {!confirmingPublish ? (
            <button className="btn btn-primary" onClick={() => setConfirmingPublish(true)}>
              Publish draw
            </button>
          ) : (
            <div className="stack" style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 14 }}>
              <p style={{ margin: 0 }}>
                Publishing freezes this result permanently and creates pending payouts for every winner. This cannot
                be undone or re-simulated afterward.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn btn-danger" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
                  {publishMutation.isPending ? "Publishing…" : "Confirm publish"}
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmingPublish(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <h3 style={{ marginBottom: 8 }}>Winners ({winners.length})</h3>
        {winners.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>No winners this draw.</p>}
        {winners.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Subscriber</th>
                <th>Tier</th>
                <th>Prize</th>
                <th>Payout</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {winners.map((m) => (
                <tr key={m.userId}>
                  <td>{m.fullName ?? m.email}</td>
                  <td>{m.tier}-match</td>
                  <td>{formatPrice(m.prizeAmountCents)}</td>
                  <td>
                    {m.payoutStatus ? (
                      <span className={`badge badge-${m.payoutStatus === "paid" ? "active" : m.payoutStatus === "failed" ? "lapsed" : "past_due"}`}>
                        {m.payoutStatus}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {m.payoutId && m.payoutStatus === "pending" && (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input
                          placeholder="method (optional)"
                          style={{ width: 120, padding: "4px 8px", fontSize: "0.8rem", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)" }}
                          value={payoutMethods[m.payoutId] ?? ""}
                          onChange={(e) => setPayoutMethods((prev) => ({ ...prev, [m.payoutId!]: e.target.value }))}
                        />
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                          disabled={payoutMutation.isPending}
                          onClick={() => payoutMutation.mutate({ payoutId: m.payoutId!, status: "paid", method: payoutMethods[m.payoutId!] })}
                        >
                          Mark paid
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                          disabled={payoutMutation.isPending}
                          onClick={() => payoutMutation.mutate({ payoutId: m.payoutId!, status: "failed", method: payoutMethods[m.payoutId!] })}
                        >
                          Mark failed
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
