import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="container section" style={{ textAlign: "center" }}>
      <h1 className="section-title">Page not found</h1>
      <p className="section-subtitle" style={{ margin: "0 auto 20px" }}>
        The page you're looking for doesn't exist.
      </p>
      <Link to="/" className="btn btn-primary">
        Back home
      </Link>
    </div>
  );
}
