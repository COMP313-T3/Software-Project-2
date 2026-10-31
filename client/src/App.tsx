import { Route, Routes } from "react-router-dom";
import RequireSession from "./components/session/RequireSession.tsx";
import SessionProvider from "./components/session/SessionProvider.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import LandingPage from "./pages/LandingPage.tsx";
import DashboardPage from "./pages/DashboardPage.tsx";
import GymsPage from "./pages/GymsPage.tsx";
import GymDetailsPage from "./pages/GymDetailsPage.tsx";
import GymAdminDashboard from "./components/gym-admin/GymAdminDashboard.tsx";
import CreateCompetitionPage from "./pages/CreateCompetitionPage.tsx";
import CompetitionDivisionsPage from "./pages/CompetitionDivisionsPage.tsx";
import ClimberDetailsPage from "./pages/ClimberDetailsPage.tsx";
import CompetitionRoutesPage from "./pages/CompetitionRoutesPage.tsx";
import AddRoutePage from "./pages/AddRoutePage.tsx";
import RouteDetailsPage from "./pages/RouteDetailsPage.tsx";
import CompetitionScoringPage from "./pages/CompetitionScoringPage.tsx";
import DiscoverCompetitionsPage from "./pages/DiscoverCompetitionsPage.tsx";
import DiscoveredEventPage from "./pages/DiscoveredEventPage.tsx";
import RegistrationStatusPage from "./pages/RegistrationStatusPage.tsx";
import LegalPage from "./pages/LegalPage.tsx";
import NotFoundPage from "./pages/NotFoundPage.tsx";
import GymRequestsPage from "./pages/GymRequestsPage.tsx";
import GymRequestDetailsPage from "./pages/GymRequestDetailsPage.tsx";
import AdministratorDetailsPage from "./pages/AdministratorDetailsPage.tsx";
import UsersPage from "./pages/UsersPage.tsx";
import UserDetailsPage from "./pages/UserDetailsPage.tsx";

/**
 * Every page route in the app. Each feature adds its pages here. Pages that need a login go
 * inside RequireSession.
 */
export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        <Route path="/forgot-password" element={<AuthPage />} />
        <Route path="/reset-password" element={<AuthPage />} />
        <Route path="/gym-request" element={<AuthPage />} />
        <Route path="/gym-admin/setup" element={<AuthPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireSession>
              <DashboardPage />
            </RequireSession>
          }
        />
        <Route path="/competitions" element={<RequireSession><DiscoverCompetitionsPage /></RequireSession>} />
        <Route path="/competitions/:competitionId" element={<RequireSession><DiscoveredEventPage /></RequireSession>} />
        <Route path="/competitions/:competitionId/registration" element={<RequireSession><RegistrationStatusPage /></RequireSession>} />
        <Route path="/admin/gyms" element={<RequireSession><GymsPage /></RequireSession>} />
        <Route path="/admin/gyms/:gymId" element={<RequireSession><GymDetailsPage /></RequireSession>} />
        <Route path="/admin/gyms/:gymId/admins/:userId" element={<RequireSession><AdministratorDetailsPage /></RequireSession>} />
        <Route path="/admin/gym-requests" element={<RequireSession><GymRequestsPage /></RequireSession>} />
        <Route path="/admin/gym-requests/:requestId" element={<RequireSession><GymRequestDetailsPage /></RequireSession>} />
        <Route path="/admin/users" element={<RequireSession><UsersPage /></RequireSession>} />
        <Route path="/admin/users/:userId" element={<RequireSession><UserDetailsPage /></RequireSession>} />
        <Route path="/gym-admin/competitions/new" element={<RequireSession><CreateCompetitionPage /></RequireSession>} />
        <Route path="/gym-admin/competitions/:competitionId/divisions" element={<RequireSession><CompetitionDivisionsPage /></RequireSession>} />
        <Route path="/gym-admin/competitions/:competitionId/climbers/:climberId" element={<RequireSession><ClimberDetailsPage /></RequireSession>} />
        <Route path="/gym-admin/competitions/:competitionId/routes" element={<RequireSession><CompetitionRoutesPage /></RequireSession>} />
        <Route path="/gym-admin/competitions/:competitionId/routes/new" element={<RequireSession><AddRoutePage /></RequireSession>} />
        <Route path="/gym-admin/competitions/:competitionId/routes/:routeId" element={<RequireSession><RouteDetailsPage /></RequireSession>} />
        <Route path="/gym-admin/competitions/:competitionId/scoring" element={<RequireSession><CompetitionScoringPage /></RequireSession>} />
        <Route path="/gym-admin/competitions/:competitionId" element={<RequireSession><GymAdminDashboard /></RequireSession>} />
        <Route path="/terms" element={<LegalPage document="terms" />} />
        <Route path="/privacy" element={<LegalPage document="privacy" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </SessionProvider>
  );
}
