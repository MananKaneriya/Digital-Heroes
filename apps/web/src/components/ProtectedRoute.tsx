import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Role } from "@digital-heroes/shared";
import { useAuth } from "../hooks/useAuth";

export function ProtectedRoute({ children, role }: { children: ReactNode; role?: Role }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="container" style={{ display: "grid", placeItems: "center", height: "50vh" }}>
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
