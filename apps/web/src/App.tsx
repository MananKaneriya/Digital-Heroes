import { Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { PricingPage } from "./pages/PricingPage";
import { DevCheckoutPage } from "./pages/DevCheckoutPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AdminPage } from "./pages/AdminPage";
import { AdminCharitiesPage } from "./pages/AdminCharitiesPage";
import { AdminDrawsPage } from "./pages/AdminDrawsPage";
import { CharitiesPage } from "./pages/CharitiesPage";
import { CharityProfilePage } from "./pages/CharityProfilePage";
import { DrawsPage } from "./pages/DrawsPage";
import { DrawDetailPage } from "./pages/DrawDetailPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/charities" element={<CharitiesPage />} />
          <Route path="/charities/:idOrSlug" element={<CharityProfilePage />} />
          <Route path="/draws" element={<DrawsPage />} />
          <Route path="/draws/:id" element={<DrawDetailPage />} />
          <Route path="/dev-checkout" element={<DevCheckoutPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/charities"
            element={
              <ProtectedRoute role="admin">
                <AdminCharitiesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/draws"
            element={
              <ProtectedRoute role="admin">
                <AdminDrawsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container">Digital Heroes — golf performance, charity, and prizes. Development build.</div>
      </footer>
    </>
  );
}
