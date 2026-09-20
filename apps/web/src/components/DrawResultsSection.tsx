import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DrawMyResultDTO, DrawPayoutStatus, WinnerVerificationStatus } from "@digital-heroes/shared";
import { formatPrice } from "@digital-heroes/shared";
import { api, ApiClientError } from "../api/client";

const PAYOUT_LABEL: Record<DrawPayoutStatus, string> = { pending: "Pending", paid: "Paid", failed: "Failed" };
const VERIFICATION_LABEL: Record<WinnerVerificationStatus, string> = {
  pending: "Proof required",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

function formatPeriod(result: DrawMyResultDTO): string {
  const start = new Date(`${result.periodStart}T00:00:00Z`);
  return start.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

const RESULTS_QUERY_KEY = ["my-draw-results"];

export function DrawResultsSection() {
  const { data: results, isLoading, isError } = useQuery({
    queryKey: RESULTS_QUERY_KEY,
    queryFn: () => api.get<DrawMyResultDTO[]>("/api/draws/me"),
  });

  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Draw results</h2>

      {isLoading && <p style={{ color: "var(--color-text-muted)" }}>Loading your draw results…</p>}

      {isError && (
        <div className="form-error" role="alert">
          We couldn't load your draw results. Please try again.
        </div>
      )}

      {results && results.length === 0 && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No published draw results yet.</p>
          <p style={{ margin: 0 }}>Once a monthly draw is published, your result will appear here.</p>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="stack">
          {results.map((r) => (
            <div key={r.drawId} style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <strong>{formatPeriod(r)}</strong>
                {r.tier ? (
                  <span className="badge badge-active">{r.tier}-number match</span>
                ) : (
                  <span style={{ color: "var(--color-text-muted)" }}>{r.matchCount} match{r.matchCount === 1 ? "" : "es"}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "0.9rem" }}>
                <span>
                  Your numbers:{" "}
                  {r.numbers.map((n) => (
                    <span key={n} style={{ fontWeight: r.winningNumbers.includes(n) ? 700 : 400, color: r.winningNumbers.includes(n) ? "var(--color-accent)" : "inherit" }}>
                      {n}{" "}
                    </span>
                  ))}
                </span>
              </div>
              {r.prizeAmountCents > 0 && (
                <>
                  <p style={{ margin: "8px 0 0" }}>
                    Prize: <strong>{formatPrice(r.prizeAmountCents)}</strong>
                  </p>
                  {r.drawMatchId && <WinnerVerificationPanel result={r} drawMatchId={r.drawMatchId} />}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WinnerVerificationPanel({ result, drawMatchId }: { result: DrawMyResultDTO; drawMatchId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const status = result.verificationStatus ?? "pending";

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.uploadFile(`/api/winners/${drawMatchId}/proof`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RESULTS_QUERY_KEY });
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err) => setUploadError(err instanceof ApiClientError ? err.message : "Could not upload your proof."),
  });

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Verification:</span>
        <span className={`badge badge-${status === "approved" ? "active" : status === "rejected" ? "lapsed" : "past_due"}`}>
          {VERIFICATION_LABEL[status]}
        </span>
        {status === "approved" && result.payoutStatus && (
          <>
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Payout:</span>
            <span className={`badge badge-${result.payoutStatus === "paid" ? "active" : result.payoutStatus === "failed" ? "lapsed" : "past_due"}`}>
              {PAYOUT_LABEL[result.payoutStatus]}
            </span>
          </>
        )}
      </div>

      {status === "rejected" && result.rejectionReason && (
        <p style={{ margin: "8px 0 0", color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Reason: {result.rejectionReason}</p>
      )}

      {status === "submitted" && (
        <p style={{ margin: "8px 0 0", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
          Your proof is awaiting admin review.
        </p>
      )}

      {(status === "pending" || status === "rejected") && (
        <div style={{ marginTop: 10 }}>
          {uploadError && (
            <div className="form-error" role="alert" style={{ marginBottom: 8 }}>
              {uploadError}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMutation.mutate(file);
            }}
          />
          {uploadMutation.isPending && <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Uploading…</p>}
          <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
            Upload a screenshot of your golf-platform scores to verify this win (PNG, JPEG, or WEBP, max 5MB).
          </p>
        </div>
      )}
    </div>
  );
}
