import { Navigate, Route, Routes } from "react-router-dom";
import RequireSession from "./components/session/RequireSession.tsx";
import SessionProvider from "./components/session/SessionProvider.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import DashboardPage from "./pages/DashboardPage.tsx";
import GymsPage from "./pages/GymsPage.tsx";
import GymDetailsPage from "./pages/GymDetailsPage.tsx";
import LegalPage from "./pages/LegalPage.tsx";
import NotFoundPage from "./pages/NotFoundPage.tsx";

/**
 * Every page route in the app. Each feature adds its pages here. Pages that need a login go
 * inside RequireSession.
 */
export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        <Route path="/forgot-password" element={<AuthPage />} />
        <Route path="/reset-password" element={<AuthPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireSession>
              <DashboardPage />
            </RequireSession>
          }
        />
        {/* US-004: RequireSession checks login; GymsPage checks ADMIN before API calls. */}
        <Route path="/admin/gyms" element={<RequireSession><GymsPage /></RequireSession>} />
        <Route path="/admin/gyms/:gymId" element={<RequireSession><GymDetailsPage /></RequireSession>} />
        <Route path="/terms" element={<LegalPage document="terms" />} />
        <Route path="/privacy" element={<LegalPage document="privacy" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </SessionProvider>
  );
}
