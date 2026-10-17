import { Navigate, useLocation } from "react-router-dom";
import AdminDashboard from "../components/admin/AdminDashboard.tsx";
import GymAdminDashboard from "../components/gym-admin/GymAdminDashboard.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ROLES } from "../constants/roles.ts";

/** Role-specific home; old Climber dashboard links lead to competition discovery. */
export default function DashboardPage() {
  const { user } = useSession();
  const { state } = useLocation();
  return user?.role === ROLES.ADMIN ? (
    <AdminDashboard key={user.userId} />
  ) : user?.role === ROLES.GYM_ADMIN ? (
    <GymAdminDashboard key={user.userId} />
  ) : (
    <Navigate to="/competitions" state={state} replace />
  );
}
