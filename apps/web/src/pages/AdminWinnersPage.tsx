import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminWinnerDetailDTO, AdminWinnerDTO, DrawPayoutStatus, WinnerVerificationStatus } from "@digital-heroes/shared";
import { formatPrice } from "@digital-heroes/shared";
import { api, ApiClientError } from "../api/client";

interface AdminWinnersResponse {
  winners: AdminWinnerDTO[];
  total: number;
  page: number;
  pageSize: number;
}

const VERIFICATION_LABEL: Record<WinnerVerificationStatus, string> = {
  pending: "Proof required",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

const PAYOUT_LABEL: Record<DrawPayoutStatus, string> = { pending: "Pending", paid: "Paid", failed: "Failed" };

function verificationBadgeClass(status: WinnerVerificationStatus): string {
  if (status === "approved") return "active";
  if (status === "rejected") return "lapsed";
  return "past_due";
}

function formatPeriod(w: { periodStart: string }): string {
  const start = new Date(`${w.periodStart}T00:00:00Z`);
  return start.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

export function AdminWinnersPage() {
  const [verificationFilter, setVerificationFilter] = useState("");
  const [payoutFilter, setPayoutFilter] = useState("");
  const [page, setPage] = useState(1);
  const [managingId, setManagingId] = useState<string | null>(null);
  const pageSize = 20;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-winners", verificationFilter, payoutFilter, page],
    queryFn: () =>
      api.get<AdminWinnersResponse>(
        `/api/winners/admin?page=${page}&pageSize=${pageSize}${verificationFilter ? `&verificationStatus=${verificationFilter}` : ""}${payoutFilter ? `&payoutStatus=${payoutFilter}` : ""}`,
      ),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="container section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="section-title">Winners</h1>
          <p className="section-subtitle" style={{ marginBottom: 0 }}>
            Review winner proof, approve or reject verification, and track payouts.
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
          <Link to="/admin/reports" className="btn btn-ghost">
            Reports
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "16px 0 20px" }}>
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label htmlFor="verification-filter">Verification status</label>
          <select
            id="verification-filter"
            value={verificationFilter}
            onChange={(e) => {
              setPage(1);
              setVerificationFilter(e.target.value);
            }}
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 12px", color: "var(--color-text)" }}
          >
            <option value="">All</option>
            <option value="pending">Proof required</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label htmlFor="payout-filter">Payout status</label>
          <select
            id="payout-filter"
            value={payoutFilter}
            onChange={(e) => {
              setPage(1);
              setPayoutFilter(e.target.value);
            }}
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 12px", color: "var(--color-text)" }}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {isLoading && <div className="spinner" role="status" aria-label="Loading winners" />}
      {isError && <p className="form-error">Could not load winners.</p>}

      {data && data.winners.length === 0 && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No winners match these filters.</p>
        </div>
      )}

      {data && data.winners.length > 0 && (
        <div className="card" style={{ overflowX: "auto", marginBottom: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Subscriber</th>
                <th>Draw</th>
                <th>Tier</th>
                <th>Prize</th>
                <th>Verification</th>
                <th>Payout</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.winners.map((w) => (
                <tr key={w.drawMatchId}>
                  <td>{w.fullName ?? w.email}</td>
                  <td>{formatPeriod(w)}</td>
                  <td>{w.tier}-match</td>
                  <td>{formatPrice(w.prizeAmountCents)}</td>
                  <td>
                    <span className={`badge badge-${verificationBadgeClass(w.verificationStatus)}`}>{VERIFICATION_LABEL[w.verificationStatus]}</span>
                  </td>
                  <td>{w.payoutStatus ? <span className={`badge badge-${w.payoutStatus === "paid" ? "active" : w.payoutStatus === "failed" ? "lapsed" : "past_due"}`}>{PAYOUT_LABEL[w.payoutStatus]}</span> : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost" onClick={() => setManagingId(managingId === w.drawMatchId ? null : w.drawMatchId)}>
                      {managingId === w.drawMatchId ? "Close" : "Review"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > pageSize && (
        <div style={{ display: "flex", gap: 10, marginBottom: 24, alignItems: "center" }}>
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span style={{ color: "var(--color-text-muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}

      {managingId && <WinnerReviewPanel drawMatchId={managingId} />}
    </div>
  );
}

function WinnerReviewPanel({ drawMatchId }: { drawMatchId: string }) {
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [payoutMethod, setPayoutMethod] = useState("");

  const { data: winner, isLoading } = useQuery({
    queryKey: ["admin-winner-detail", drawMatchId],
    queryFn: () => api.get<AdminWinnerDetailDTO>(`/api/winners/admin/${drawMatchId}`),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["admin-winners"] });
    queryClient.invalidateQueries({ queryKey: ["admin-winner-detail", drawMatchId] });
  }

  // On error (including a 409 from a lost race with another admin's concurrent
  // decision), refresh alongside showing the message — otherwise the panel
  // keeps showing stale action buttons for a state that already moved on.
  const approveMutation = useMutation({
    mutationFn: () => api.post(`/api/winners/admin/${drawMatchId}/verify`),
    onSuccess: invalidateAll,
    onError: (err) => {
      setMutationError(err instanceof ApiClientError ? err.message : "Could not approve this winner.");
      invalidateAll();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/api/winners/admin/${drawMatchId}/reject`, { reason }),
    onSuccess: () => {
      invalidateAll();
      setRejectOpen(false);
      setReason("");
    },
    onError: (err) => {
      setMutationError(err instanceof ApiClientError ? err.message : "Could not reject this winner.");
      invalidateAll();
    },
  });

  const payoutMutation = useMutation({
    mutationFn: (status: "paid" | "failed") => api.patch(`/api/draws/admin/payouts/${winner!.payoutId}`, { status, method: payoutMethod || undefined }),
    onSuccess: invalidateAll,
    onError: (err) => {
      setMutationError(err instanceof ApiClientError ? err.message : "Could not update the payout.");
      invalidateAll();
    },
  });

  if (isLoading || !winner) return <div className="spinner" role="status" aria-label="Loading winner detail" />;

  return (
    <div className="card stack" style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>
          {winner.fullName ?? winner.email} — {formatPeriod(winner)}
        </h2>
        <span className={`badge badge-${verificationBadgeClass(winner.verificationStatus)}`}>{VERIFICATION_LABEL[winner.verificationStatus]}</span>
      </div>

      {mutationError && <div className="form-error">{mutationError}</div>}

      <p style={{ margin: 0 }}>
        <strong>{winner.tier}-number match</strong> · Prize {formatPrice(winner.prizeAmountCents)}
      </p>

      {winner.rejectionReason && (
        <p style={{ margin: 0, color: "var(--color-text-muted)" }}>Previous rejection reason: {winner.rejectionReason}</p>
      )}

      <div>
        <h3 style={{ marginBottom: 8 }}>Submitted proof</h3>
        {!winner.proofSignedUrl && <p style={{ color: "var(--color-text-muted)" }}>No proof uploaded yet.</p>}
        {winner.proofSignedUrl && (
          <img
            src={winner.proofSignedUrl}
            alt="Winner proof screenshot"
            style={{ maxWidth: 320, maxHeight: 320, borderRadius: 10, border: "1px solid var(--color-border)" }}
          />
        )}
      </div>

      {winner.verificationStatus === "submitted" && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <button className="btn btn-primary" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
            Approve
          </button>
          {!rejectOpen ? (
            <button className="btn btn-danger" onClick={() => setRejectOpen(true)}>
              Reject
            </button>
          ) : (
            <div className="stack" style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 12, minWidth: 260 }}>
              <label htmlFor="reject-reason" style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                Rejection reason
              </label>
              <input id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-danger" disabled={rejectMutation.isPending || !reason.trim()} onClick={() => rejectMutation.mutate()}>
                  Confirm reject
                </button>
                <button className="btn btn-ghost" onClick={() => setRejectOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {winner.verificationStatus === "approved" && winner.payoutId && winner.payoutStatus === "pending" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="method (optional)"
            value={payoutMethod}
            onChange={(e) => setPayoutMethod(e.target.value)}
            style={{ width: 160, padding: "8px 10px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-text)" }}
          />
          <button className="btn btn-primary" disabled={payoutMutation.isPending} onClick={() => payoutMutation.mutate("paid")}>
            Mark paid
          </button>
          <button className="btn btn-danger" disabled={payoutMutation.isPending} onClick={() => payoutMutation.mutate("failed")}>
            Mark failed
          </button>
        </div>
      )}

      {winner.payoutStatus === "paid" && <p style={{ color: "var(--color-text-muted)", margin: 0 }}>Payout complete — no further action available.</p>}
    </div>
  );
}
