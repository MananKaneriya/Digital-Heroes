import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function SignupPage() {
  const { signup, error, clearError } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signup(email, password, fullName);
      navigate("/pricing");
    } catch {
      // error state is surfaced via context
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card stack">
        <h1 style={{ marginBottom: 0 }}>Create your account</h1>
        <p className="section-subtitle" style={{ marginBottom: 0 }}>
          Join Digital Heroes, then choose a plan to unlock scoring, draws, and charity giving.
        </p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <form className="stack" onSubmit={onSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => {
                clearError();
                setFullName(e.target.value);
              }}
            />
          </div>
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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => {
                clearError();
                setPassword(e.target.value);
              }}
            />
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
              At least 8 characters, including a letter and a number.
            </span>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", margin: 0 }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
