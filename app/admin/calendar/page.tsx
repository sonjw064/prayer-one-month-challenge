import { AdminCalendarManagement } from "../../../components/admin/calendar/AdminCalendarManagement";
import { todayInSeoul } from "../../../src/features/challenge/date";

export default function AdminCalendarPage() {
  return (
    <main className="admin-shell">
      <AdminCalendarManagement today={todayInSeoul()} />
    </main>
  );
}
