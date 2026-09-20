import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CharityDTO } from "@digital-heroes/shared";
import { api } from "../api/client";

export function HomePage() {
  const { data: featuredCharity, isLoading: featuredLoading } = useQuery({
    queryKey: ["featured-charity"],
    queryFn: () => api.get<CharityDTO | null>("/api/charities/featured", { auth: false }),
  });

  return (
    <div>
      <section className="hero container">
        <span className="badge badge-active">Charity-led golf rewards</span>
        <h1>Play golf. Track your scores. Fund the causes you care about.</h1>
        <p>
          Digital Heroes turns your monthly golf scores into a shot at real prize draws — while a share of every
          subscription goes straight to a charity you choose.
        </p>
        <div className="hero-actions">
          <Link to="/signup" className="btn btn-primary">
            Become a Digital Hero
          </Link>
          <Link to="/pricing" className="btn btn-ghost">
            See plans &amp; pricing
          </Link>
        </div>
      </section>

      <section className="section container">
        <h2 className="section-title">How it works</h2>
        <p className="section-subtitle">Three simple steps connect your game to real prizes and real impact.</p>
        <div className="grid-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div className="card stack">
            <span className="badge badge-active">Step 1</span>
            <h3>Subscribe</h3>
            <p>Pick a monthly or yearly plan. Your subscription funds the prize pool and your chosen charity.</p>
          </div>
          <div className="card stack">
            <span className="badge badge-active">Step 2</span>
            <h3>Log your scores</h3>
            <p>Enter your latest Stableford rounds. We keep your five most recent scores on record.</p>
          </div>
          <div className="card stack">
            <span className="badge badge-active">Step 3</span>
            <h3>Win &amp; give</h3>
            <p>Every month, subscribers are entered into a prize draw — while your contribution supports charity.</p>
          </div>
        </div>
      </section>

      <section className="section container">
        <h2 className="section-title">Featured charity</h2>
        <p className="section-subtitle">
          At least 10% of every subscription goes to a charity you select — and you can choose to give more.
          Independent, one-off donations are always available too, separate from gameplay.
        </p>

        {featuredLoading && <div className="spinner" role="status" aria-label="Loading featured charity" />}

        {!featuredLoading && !featuredCharity && (
          <div className="card" style={{ textAlign: "center" }}>
            <p style={{ margin: 0, color: "var(--color-text-muted)" }}>No charity is currently featured.</p>
            <Link to="/charities" className="btn btn-ghost" style={{ marginTop: 12 }}>
              Explore all charities
            </Link>
          </div>
        )}

        {featuredCharity && (
          <div className="card stack" style={{ textAlign: "center" }}>
            <span className="badge badge-active">Featured this month</span>
            <h3 style={{ margin: 0 }}>{featuredCharity.name}</h3>
            <p style={{ color: "var(--color-text-muted)", maxWidth: 560, margin: "0 auto" }}>{featuredCharity.shortDescription}</p>
            <div className="hero-actions">
              <Link to={`/charities/${featuredCharity.slug}`} className="btn btn-primary">
                Meet {featuredCharity.name}
              </Link>
              <Link to="/signup" className="btn btn-ghost">
                Start subscribing
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
