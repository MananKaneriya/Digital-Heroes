import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CharityDTO } from "@digital-heroes/shared";
import { api } from "../api/client";

interface CharitiesResponse {
  charities: CharityDTO[];
  total: number;
}

export function CharitiesPage() {
  const [search, setSearch] = useState("");
  const [upcomingOnly, setUpcomingOnly] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["charities", search, upcomingOnly],
    queryFn: () =>
      api.get<CharitiesResponse>(
        `/api/charities?pageSize=24${search ? `&search=${encodeURIComponent(search)}` : ""}${upcomingOnly ? "&hasUpcomingEvents=true" : ""}`,
        { auth: false },
      ),
  });

  return (
    <div className="container section">
      <h1 className="section-title">Charities</h1>
      <p className="section-subtitle">
        Every Digital Heroes subscription funds a charity you choose. Explore the causes you can support.
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 28 }}>
        <div className="form-field" style={{ marginBottom: 0, minWidth: 240 }}>
          <label htmlFor="charity-search">Search charities</label>
          <input id="charity-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. ocean, children" />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-muted)", paddingBottom: 11 }}>
          <input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} />
          Has upcoming events
        </label>
      </div>

      {isLoading && <div className="spinner" role="status" aria-label="Loading charities" />}
      {isError && <p className="form-error">Could not load charities right now. Please try again.</p>}
      {data && data.charities.length === 0 && (
        <div className="empty-state">
          <p>No charities match your search.</p>
        </div>
      )}

      {data && data.charities.length > 0 && (
        <div className="plan-grid">
          {data.charities.map((charity) => (
            <Link key={charity.id} to={`/charities/${charity.slug}`} className="card plan-card stack" style={{ textDecoration: "none", color: "inherit" }}>
              {charity.isFeatured && <span className="badge badge-active">Featured</span>}
              <h3 style={{ margin: 0 }}>{charity.name}</h3>
              <p style={{ color: "var(--color-text-muted)", flexGrow: 1 }}>{charity.shortDescription}</p>
              <span className="btn btn-ghost">View profile</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
