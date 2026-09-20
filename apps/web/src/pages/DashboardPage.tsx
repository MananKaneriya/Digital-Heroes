import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SubscriptionDTO } from "@digital-heroes/shared";
import { api, ApiClientError } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { GolfScoresSection } from "../components/GolfScoresSection";
import { CharitySelectionSection } from "../components/CharitySelectionSection";
import { DrawResultsSection } from "../components/DrawResultsSection";

const STATUS_LABEL: Record<SubscriptionDTO["status"], string> = {
  active: "Active",
  past_due: "Payment past due",
  canceled: "Canceled",
  lapsed: "Lapsed",
  incomplete: "Incomplete",
};

export function DashboardPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => api.get<SubscriptionDTO | null>("/api/subscriptions/me"),
  });

  const cancelMutation = useMutation({
    mutationFn: (immediately: boolean) => api.post<SubscriptionDTO>("/api/subscriptions/cancel", { immediately }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["my-subscription"], updated);
      setConfirmingCancel(false);
    },
    onError: (err) => setActionError(err instanceof ApiClientError ? err.message : "Could not cancel subscription."),
  });

  return (
    <div className="container section">
      <h1 className="section-title">Welcome back, {user?.fullName ?? "Hero"}</h1>
      <p className="section-subtitle">Your subscription, scores, and draw participation live here.</p>

      {params.get("checkout") === "success" && (
        <div className="dev-banner" style={{ background: "rgba(34,211,165,0.12)", borderColor: "rgba(34,211,165,0.4)", color: "var(--color-accent)" }}>
          Payment confirmed — your subscription is now active.
        </div>
      )}
      {params.get("donation") === "success" && (
        <div className="dev-banner" style={{ background: "rgba(34,211,165,0.12)", borderColor: "rgba(34,211,165,0.4)", color: "var(--color-accent)" }}>
          Thank you — your donation was confirmed.
        </div>
      )}

      <div className="grid-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="card stack">
          <h2 style={{ margin: 0 }}>Subscription</h2>
          {isLoading && <div className="spinner" role="status" aria-label="Loading subscription" />}

          {!isLoading && !subscription && (
            <div className="empty-state">
              <p>You don't have an active subscription yet.</p>
              <a href="/pricing" className="btn btn-primary">
                View plans
              </a>
            </div>
          )}

          {subscription && (
            <>
              <span className={`badge badge-${subscription.status}`}>{STATUS_LABEL[subscription.status]}</span>
              <p style={{ margin: 0, textTransform: "capitalize" }}>{subscription.planCode} plan</p>
              {subscription.currentPeriodEnd && (
                <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
                  {subscription.cancelAtPeriodEnd ? "Access ends" : "Renews"} on{" "}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}

              {actionError && (
                <div className="form-error" role="alert">
                  {actionError}
                </div>
              )}

              {subscription.status !== "canceled" && !subscription.cancelAtPeriodEnd && (
                <>
                  {!confirmingCancel ? (
                    <button className="btn btn-ghost" onClick={() => setConfirmingCancel(true)}>
                      Cancel subscription
                    </button>
                  ) : (
                    <div className="stack" style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 14 }}>
                      <p style={{ margin: 0 }}>
                        Cancel at the end of the current billing period, or cancel immediately and lose access now?
                      </p>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          className="btn btn-ghost"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(false)}
                        >
                          At period end
                        </button>
                        <button
                          className="btn btn-danger"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(true)}
                        >
                          Cancel immediately
                        </button>
                        <button className="btn btn-ghost" onClick={() => setConfirmingCancel(false)}>
                          Keep subscription
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {subscription?.status === "active" || subscription?.status === "past_due" ? (
          <GolfScoresSection />
        ) : (
          !isLoading && (
            <div className="card stack">
              <h2 style={{ margin: 0 }}>Golf scores</h2>
              <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
                An active subscription is required to track Stableford scores.{" "}
                {!subscription && (
                  <a href="/pricing" className="btn btn-primary" style={{ marginTop: 12 }}>
                    View plans
                  </a>
                )}
              </p>
            </div>
          )
        )}

        {subscription?.status === "active" || subscription?.status === "past_due" ? (
          <CharitySelectionSection />
        ) : (
          !isLoading && (
            <div className="card stack">
              <h2 style={{ margin: 0 }}>Charity</h2>
              <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
                An active subscription is required to direct part of your subscription to a charity.
              </p>
            </div>
          )
        )}

        {subscription?.status === "active" || subscription?.status === "past_due" ? (
          <DrawResultsSection />
        ) : (
          !isLoading && (
            <div className="card stack">
              <h2 style={{ margin: 0 }}>Draw results</h2>
              <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
                An active subscription is required to participate in the monthly draw.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
