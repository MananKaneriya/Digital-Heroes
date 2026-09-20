import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <header className="container">
      <nav className="navbar" aria-label="Primary">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            DH
          </span>
          Digital Heroes
        </Link>
        <ul className="nav-links">
          <li>
            <Link to="/charities">Charities</Link>
          </li>
          <li>
            <Link to="/draws">Draws</Link>
          </li>
          <li>
            <Link to="/pricing">Pricing</Link>
          </li>
          {user && (
            <li>
              <Link to="/dashboard">Dashboard</Link>
            </li>
          )}
          {user?.role === "admin" && (
            <li>
              <Link to="/admin">Admin</Link>
            </li>
          )}
        </ul>
        <div className="nav-links">
          {user ? (
            <>
              <span>{user.fullName ?? user.email}</span>
              <button className="btn btn-ghost" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/signup" className="btn btn-primary">
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
