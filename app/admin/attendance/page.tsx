import { AdminAttendanceStats } from "../../../components/admin/attendance/AdminAttendanceStats";
import { todayInSeoul } from "../../../src/features/challenge/date";

export default function AdminAttendancePage() {
  return (
    <main className="admin-shell">
      <AdminAttendanceStats today={todayInSeoul()} />
    </main>
  );
}
