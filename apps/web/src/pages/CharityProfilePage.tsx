import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CharityDTO, CharityEventDTO, CharityMediaDTO, CharitySelectionDTO } from "@digital-heroes/shared";
import { MIN_CHARITY_CONTRIBUTION_PERCENT } from "@digital-heroes/shared";
import { api, ApiClientError } from "../api/client";
import { useAuth } from "../hooks/useAuth";

interface ProfileResponse {
  charity: CharityDTO;
  media: CharityMediaDTO[];
}

export function CharityProfilePage() {
  const { idOrSlug = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [contributionPercent, setContributionPercent] = useState(String(MIN_CHARITY_CONTRIBUTION_PERCENT));
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [donationAmount, setDonationAmount] = useState("25");
  const [donationError, setDonationError] = useState<string | null>(null);
  const [donationPending, setDonationPending] = useState(false);

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ["charity-profile", idOrSlug],
    queryFn: () => api.get<ProfileResponse>(`/api/charities/${idOrSlug}`, { auth: false }),
  });

  const { data: events } = useQuery({
    queryKey: ["charity-events", idOrSlug],
    queryFn: () => api.get<CharityEventDTO[]>(`/api/charities/${idOrSlug}/events`, { auth: false }),
    enabled: Boolean(profile),
  });

  const { data: mySelection } = useQuery({
    queryKey: ["my-charity-selection"],
    queryFn: () => api.get<CharitySelectionDTO | null>("/api/charities/me/selection"),
    enabled: Boolean(user),
    retry: false,
  });

  const selectMutation = useMutation({
    mutationFn: (percent: number) =>
      api.put<CharitySelectionDTO>("/api/charities/me/selection", { charityId: profile!.charity.id, contributionPercent: percent }),
    onSuccess: (selection) => {
      queryClient.setQueryData(["my-charity-selection"], selection);
      setSelectionError(null);
    },
    onError: (err) => setSelectionError(err instanceof ApiClientError ? err.message : "Could not update your charity selection."),
  });

  async function submitDonation() {
    if (!profile) return;
    const dollars = Number(donationAmount);
    if (!Number.isFinite(dollars) || dollars < 1) {
      setDonationError("Enter a donation amount of at least $1.00.");
      return;
    }
    setDonationError(null);
    setDonationPending(true);
    try {
      const result = await api.post<{ url: string }>("/api/donations/checkout", { charityId: profile.charity.id, amountCents: Math.round(dollars * 100) });
      window.location.href = result.url;
    } catch (err) {
      setDonationError(err instanceof ApiClientError ? err.message : "Could not start the donation.");
      setDonationPending(false);
    }
  }

  if (isLoading) return <div className="container section"><div className="spinner" role="status" aria-label="Loading charity" /></div>;
  if (isError || !profile) return <div className="container section"><p className="form-error">Charity not found.</p></div>;

  const { charity, media } = profile;
  const isCurrentSelection = mySelection?.charityId === charity.id;

  return (
    <div className="container section">
      {charity.isFeatured && <span className="badge badge-active">Featured charity</span>}
      <h1 className="section-title">{charity.name}</h1>
      <p className="section-subtitle">{charity.shortDescription}</p>

      <div className="grid-cols" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="stack">
          <div className="card">
            <p style={{ whiteSpace: "pre-line", margin: 0 }}>{charity.fullDescription}</p>
          </div>

          {media.length > 0 && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Gallery</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                {media.map((m) => (
                  <img key={m.id} src={m.url} alt={m.altText ?? charity.name} style={{ width: "100%", borderRadius: 10, aspectRatio: "1", objectFit: "cover" }} />
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Upcoming events</h2>
            {!events && <p style={{ color: "var(--color-text-muted)" }}>Loading events…</p>}
            {events && events.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>No upcoming events right now.</p>}
            {events && events.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {events.map((e) => (
                  <li key={e.id} style={{ marginBottom: 10 }}>
                    <strong>{e.title}</strong> —{" "}
                    {new Date(`${e.eventDate}T00:00:00Z`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
                    {e.location && <span style={{ color: "var(--color-text-muted)" }}> · {e.location}</span>}
                    {e.description && <p style={{ margin: "4px 0 0", color: "var(--color-text-muted)" }}>{e.description}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <h2 style={{ margin: 0 }}>Support this charity</h2>
            {!user && (
              <p style={{ color: "var(--color-text-muted)" }}>
                <a href="/signup">Sign up</a> and subscribe to direct part of your subscription to this charity.
              </p>
            )}
            {user && (
              <>
                {isCurrentSelection && <p style={{ margin: 0 }}>This is your currently selected charity ({mySelection?.contributionPercent}%).</p>}
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label htmlFor="contribution-percent">Contribution percentage (min {MIN_CHARITY_CONTRIBUTION_PERCENT}%)</label>
                  <input
                    id="contribution-percent"
                    type="number"
                    min={MIN_CHARITY_CONTRIBUTION_PERCENT}
                    max={100}
                    value={contributionPercent}
                    onChange={(e) => setContributionPercent(e.target.value)}
                  />
                </div>
                {selectionError && <div className="form-error">{selectionError}</div>}
                <button
                  className="btn btn-primary"
                  disabled={selectMutation.isPending}
                  onClick={() => selectMutation.mutate(Number(contributionPercent))}
                >
                  {selectMutation.isPending ? "Saving…" : isCurrentSelection ? "Update contribution" : "Select this charity"}
                </button>
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: 0 }}>
                  Requires an active subscription. Changing charity does not affect past contributions.
                </p>
              </>
            )}
          </div>

          <div className="card stack">
            <h2 style={{ margin: 0 }}>Make an independent donation</h2>
            <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
              A one-off gift, separate from your subscription — it doesn't affect draw eligibility or your Stableford scores.
            </p>
            {!user ? (
              <a href="/login" className="btn btn-ghost">
                Log in to donate
              </a>
            ) : (
              <>
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label htmlFor="donation-amount">Amount (USD)</label>
                  <input id="donation-amount" type="number" min={1} step="1" value={donationAmount} onChange={(e) => setDonationAmount(e.target.value)} />
                </div>
                {donationError && <div className="form-error">{donationError}</div>}
                <button className="btn btn-primary" disabled={donationPending} onClick={submitDonation}>
                  {donationPending ? "Redirecting…" : "Donate"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
