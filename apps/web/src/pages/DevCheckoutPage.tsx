import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiClientError } from "../api/client";

/**
 * Stands in for Stripe-hosted checkout when the API is running with no real
 * Stripe keys configured (see apps/api/src/modules/subscriptions/stripe.provider.dev.ts).
 * This page only exists in development to let the full subscribe/donate flow be
 * exercised end-to-end without a Stripe account — it is clearly labeled as
 * a simulation rather than pretending to be real payment collection. Handles
 * both subscription checkout sessions and independent-donation sessions
 * (distinguished by the `kind=donation` query param set at session creation).
 */
export function DevCheckoutPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  const isDonation = params.get("kind") === "donation";
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function completePayment() {
    if (!sessionId) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isDonation) {
        await api.post("/api/donations/dev/complete-checkout", { sessionId }, { auth: false });
        navigate("/dashboard?donation=success");
      } else {
        await api.post("/api/subscriptions/dev/complete-checkout", { sessionId }, { auth: false });
        navigate("/dashboard?checkout=success");
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not complete the mock payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card stack">
        <div className="dev-banner">
          DEVELOPMENT MOCK CHECKOUT — no real Stripe account is configured, so no payment is
          actually collected here. Configure STRIPE_SECRET_KEY in apps/api/.env to use real Stripe test mode.
        </div>
        <h1 style={{ marginBottom: 0 }}>{isDonation ? "Simulate donation" : "Simulate payment"}</h1>
        <p className="section-subtitle" style={{ marginBottom: 0 }}>
          In production this step redirects to Stripe's own hosted checkout page. Click below to simulate a
          successful {isDonation ? "donation" : "payment and activate the subscription"}.
        </p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {!sessionId ? (
          <p className="form-error">Missing checkout session.</p>
        ) : (
          <button className="btn btn-primary btn-block" onClick={completePayment} disabled={submitting}>
            {submitting ? "Completing…" : `Simulate successful ${isDonation ? "donation" : "payment"}`}
          </button>
        )}
      </div>
    </div>
  );
}
