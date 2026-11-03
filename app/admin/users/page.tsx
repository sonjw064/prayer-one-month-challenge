import { AdminSignupRequests } from "../../../components/admin/signup/AdminSignupRequests";
import { AdminUserManagementLoader } from "../../../components/admin/users/AdminUserManagementLoader";
import { SamLeaderSettings } from "../../../components/admin/settings/SamLeaderSettings";

export default function AdminUsersPage() {
  return (
    <main className="admin-shell">
      <AdminSignupRequests />
      <AdminUserManagementLoader />
      <SamLeaderSettings />
    </main>
  );
}
