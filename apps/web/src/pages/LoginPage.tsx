import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { login, error, clearError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch {
      // error state is surfaced via context
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card stack">
        <h1 style={{ marginBottom: 0 }}>Welcome back</h1>
        <p className="section-subtitle" style={{ marginBottom: 0 }}>
          Log in to track scores, view your draw participation, and manage your subscription.
        </p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <form className="stack" onSubmit={onSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                clearError();
                setEmail(e.target.value);
              }}
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                clearError();
                setPassword(e.target.value);
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", margin: 0 }}>
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
