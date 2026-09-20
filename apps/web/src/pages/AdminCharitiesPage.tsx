import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CharityDTO, CharityEventDTO, CharityMediaDTO } from "@digital-heroes/shared";
import { api, ApiClientError } from "../api/client";

interface AdminCharitiesResponse {
  charities: CharityDTO[];
  total: number;
}

interface ProfileResponse {
  charity: CharityDTO;
  media: CharityMediaDTO[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AdminCharitiesPage() {
  const queryClient = useQueryClient();
  const [managingId, setManagingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", shortDescription: "", fullDescription: "" });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-charities"],
    queryFn: () => api.get<AdminCharitiesResponse>("/api/charities/admin?pageSize=50"),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; slug: string; shortDescription: string; fullDescription: string }) =>
      api.post<CharityDTO>("/api/charities/admin", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-charities"] });
      setCreateForm({ name: "", shortDescription: "", fullDescription: "" });
      setCreateOpen(false);
      setCreateError(null);
    },
    onError: (err) => setCreateError(err instanceof ApiClientError ? err.message : "Could not create charity."),
  });

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) {
      setCreateError("Name is required.");
      return;
    }
    createMutation.mutate({ ...createForm, slug: slugify(createForm.name) });
  }

  return (
    <div className="container section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="section-title">Charities</h1>
          <p className="section-subtitle" style={{ marginBottom: 0 }}>
            Manage charities, media, events, and the homepage featured charity.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link to="/admin" className="btn btn-ghost">
            Users
          </Link>
          <Link to="/admin/draws" className="btn btn-ghost">
            Draws
          </Link>
          <Link to="/admin/winners" className="btn btn-ghost">
            Winners
          </Link>
          <Link to="/admin/reports" className="btn btn-ghost">
            Reports
          </Link>
        </div>
      </div>

      <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => setCreateOpen((v) => !v)}>
        {createOpen ? "Cancel" : "Add charity"}
      </button>

      {createOpen && (
        <form className="card stack" onSubmit={submitCreate} noValidate style={{ marginBottom: 24, maxWidth: 560 }}>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="new-name">Name</label>
            <input id="new-name" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="new-short">Short description</label>
            <input id="new-short" value={createForm.shortDescription} onChange={(e) => setCreateForm((f) => ({ ...f, shortDescription: e.target.value }))} />
          </div>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="new-full">Full description</label>
            <textarea
              id="new-full"
              rows={4}
              style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 11, color: "var(--color-text)" }}
              value={createForm.fullDescription}
              onChange={(e) => setCreateForm((f) => ({ ...f, fullDescription: e.target.value }))}
            />
          </div>
          {createError && <div className="form-error">{createError}</div>}
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create charity"}
          </button>
        </form>
      )}

      {isLoading && <div className="spinner" role="status" aria-label="Loading charities" />}
      {isError && <p className="form-error">Could not load charities.</p>}

      {data && (
        <div className="card" style={{ overflowX: "auto", marginBottom: 24 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Featured</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.charities.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <span className={`badge badge-${c.isActive ? "active" : "canceled"}`}>{c.isActive ? "Active" : "Inactive"}</span>
                  </td>
                  <td>{c.isFeatured ? "★ Featured" : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-ghost" onClick={() => setManagingId(managingId === c.id ? null : c.id)}>
                      {managingId === c.id ? "Close" : "Manage"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {managingId && <CharityManagementPanel charityId={managingId} />}
    </div>
  );
}

function CharityManagementPanel({ charityId }: { charityId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({ title: "", eventDate: "", location: "", description: "" });

  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin-charity-profile", charityId],
    queryFn: () => api.get<ProfileResponse>(`/api/charities/${charityId}`),
  });

  const { data: events } = useQuery({
    queryKey: ["admin-charity-events", charityId],
    queryFn: () => api.get<CharityEventDTO[]>(`/api/charities/${charityId}/events`),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["admin-charities"] });
    queryClient.invalidateQueries({ queryKey: ["admin-charity-profile", charityId] });
    queryClient.invalidateQueries({ queryKey: ["admin-charity-events", charityId] });
  }

  const toggleActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => api.patch(`/api/charities/admin/${charityId}`, { isActive }),
    onSuccess: () => {
      invalidateAll();
      setConfirmingDeactivate(false);
    },
    onError: (err) => setMutationError(err instanceof ApiClientError ? err.message : "Could not update charity status."),
  });

  const setFeaturedMutation = useMutation({
    mutationFn: (featured: boolean) => api.put("/api/charities/admin/featured", { charityId: featured ? charityId : null }),
    onSuccess: invalidateAll,
    onError: (err) => setMutationError(err instanceof ApiClientError ? err.message : "Could not update featured charity."),
  });

  const uploadMediaMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.uploadFile(`/api/charities/admin/${charityId}/media`, formData);
    },
    onSuccess: () => {
      invalidateAll();
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err) => setMutationError(err instanceof ApiClientError ? err.message : "Could not upload image."),
  });

  const deleteMediaMutation = useMutation({
    mutationFn: (mediaId: string) => api.delete(`/api/charities/admin/media/${mediaId}`),
    onSuccess: invalidateAll,
    onError: (err) => setMutationError(err instanceof ApiClientError ? err.message : "Could not delete image."),
  });

  const createEventMutation = useMutation({
    mutationFn: () => api.post(`/api/charities/admin/${charityId}/events`, newEvent),
    onSuccess: () => {
      invalidateAll();
      setNewEvent({ title: "", eventDate: "", location: "", description: "" });
    },
    onError: (err) => setMutationError(err instanceof ApiClientError ? err.message : "Could not create event."),
  });

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => api.delete(`/api/charities/admin/events/${eventId}`),
    onSuccess: invalidateAll,
    onError: (err) => setMutationError(err instanceof ApiClientError ? err.message : "Could not delete event."),
  });

  if (isLoading || !profile) return <div className="spinner" role="status" aria-label="Loading charity detail" />;
  const { charity, media } = profile;

  return (
    <div className="card stack" style={{ marginTop: 8 }}>
      <h2 style={{ margin: 0 }}>{charity.name}</h2>
      {mutationError && <div className="form-error">{mutationError}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!confirmingDeactivate ? (
          <button className="btn btn-ghost" onClick={() => (charity.isActive ? setConfirmingDeactivate(true) : toggleActiveMutation.mutate(true))}>
            {charity.isActive ? "Deactivate" : "Activate"}
          </button>
        ) : (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            Deactivate this charity? Historical contributions are preserved.
            <button className="btn btn-danger" onClick={() => toggleActiveMutation.mutate(false)} disabled={toggleActiveMutation.isPending}>
              Confirm
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmingDeactivate(false)}>
              Cancel
            </button>
          </span>
        )}
        <button className="btn btn-ghost" onClick={() => setFeaturedMutation.mutate(!charity.isFeatured)} disabled={setFeaturedMutation.isPending}>
          {charity.isFeatured ? "Remove from homepage spotlight" : "Set as featured"}
        </button>
      </div>

      <div>
        <h3 style={{ marginBottom: 8 }}>Media</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          {media.map((m) => (
            <div key={m.id} style={{ position: "relative" }}>
              <img src={m.url} alt={m.altText ?? ""} style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8 }} />
              <button className="btn btn-danger" style={{ padding: "2px 8px", fontSize: "0.75rem", position: "absolute", top: 4, right: 4 }} onClick={() => deleteMediaMutation.mutate(m.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMediaMutation.mutate(file);
          }}
        />
        {uploadMediaMutation.isPending && <p style={{ color: "var(--color-text-muted)" }}>Uploading…</p>}
      </div>

      <div>
        <h3 style={{ marginBottom: 8 }}>Events</h3>
        {events && events.length > 0 && (
          <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
            {events.map((e) => (
              <li key={e.id} style={{ marginBottom: 6 }}>
                {e.title} — {e.eventDate}{" "}
                <button className="btn btn-ghost" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => deleteEventMutation.mutate(e.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label>Title</label>
            <input value={newEvent.title} onChange={(e) => setNewEvent((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input type="date" value={newEvent.eventDate} onChange={(e) => setNewEvent((f) => ({ ...f, eventDate: e.target.value }))} />
          </div>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label>Location</label>
            <input value={newEvent.location} onChange={(e) => setNewEvent((f) => ({ ...f, location: e.target.value }))} />
          </div>
          <button className="btn btn-primary" disabled={createEventMutation.isPending || !newEvent.title || !newEvent.eventDate} onClick={() => createEventMutation.mutate()}>
            Add event
          </button>
        </div>
      </div>
    </div>
  );
}
