import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

interface AdminUserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  createdAt: string;
}

interface UsersResponse {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function AdminPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-users", search, page],
    queryFn: () =>
      api.get<UsersResponse>(
        `/api/users?page=${page}&pageSize=${pageSize}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="container section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="section-title">Users</h1>
          <p className="section-subtitle" style={{ marginBottom: 0 }}>Search and review registered accounts.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link to="/admin/charities" className="btn btn-ghost">
            Charities
          </Link>
          <Link to="/admin/draws" className="btn btn-ghost">
            Draws
          </Link>
        </div>
      </div>

      <div className="form-field" style={{ maxWidth: 320 }}>
        <label htmlFor="search">Search by name or email</label>
        <input
          id="search"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="e.g. sam@example.com"
        />
      </div>

      {isLoading && <div className="spinner" role="status" aria-label="Loading users" />}
      {isError && <p className="form-error">Could not load users right now.</p>}

      {data && data.users.length === 0 && <div className="empty-state">No users match your search.</div>}

      {data && data.users.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName ?? "—"}</td>
                  <td>{u.email}</td>
                  <td style={{ textTransform: "capitalize" }}>{u.role}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > pageSize && (
        <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span style={{ color: "var(--color-text-muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
