import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { SubscriptionPlanDTO } from "@digital-heroes/shared";
import { formatPrice } from "@digital-heroes/shared";
import { api, ApiClientError } from "../api/client";
import { useAuth } from "../hooks/useAuth";

export function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const { data: plans, isLoading, isError } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get<SubscriptionPlanDTO[]>("/api/subscriptions/plans", { auth: false }),
  });

  async function subscribe(planCode: string) {
    if (!user) {
      navigate("/signup");
      return;
    }
    setCheckoutError(null);
    setPendingPlan(planCode);
    try {
      const result = await api.post<{ url: string }>("/api/subscriptions/checkout", { planCode });
      window.location.href = result.url;
    } catch (err) {
      setCheckoutError(err instanceof ApiClientError ? err.message : "Could not start checkout.");
      setPendingPlan(null);
    }
  }

  return (
    <div className="container section">
      <h1 className="section-title">Choose your plan</h1>
      <p className="section-subtitle">
        Every plan funds the monthly prize pool and your chosen charity. Cancel anytime.
      </p>

      {checkoutError && (
        <div className="form-error" role="alert" style={{ marginBottom: 20 }}>
          {checkoutError}
        </div>
      )}

      {isLoading && <div className="spinner" role="status" aria-label="Loading plans" />}
      {isError && <p className="form-error">Could not load plans right now. Please try again shortly.</p>}

      {plans && (
        <div className="plan-grid">
          {plans.map((plan) => (
            <div key={plan.id} className="card plan-card stack">
              <h3 style={{ margin: 0 }}>{plan.name}</h3>
              <div className="plan-price">
                {formatPrice(plan.priceCents, plan.currency)}
                <span> / {plan.billingInterval}</span>
              </div>
              <p style={{ color: "var(--color-text-muted)", flexGrow: 1 }}>{plan.description}</p>
              <button
                className="btn btn-primary btn-block"
                onClick={() => subscribe(plan.code)}
                disabled={pendingPlan === plan.code}
              >
                {pendingPlan === plan.code ? "Redirecting…" : user ? "Subscribe" : "Sign up to subscribe"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
