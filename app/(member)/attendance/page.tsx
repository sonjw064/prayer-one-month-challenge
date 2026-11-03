import { redirect } from "next/navigation";
import { AttendanceBoard } from "../../../components/attendance/AttendanceBoard";
import { getCurrentSessionUser } from "../../../src/features/auth/http-session";

export default async function AttendancePage() {
  const user = await getCurrentSessionUser();
  if (!user) redirect("/login");

  return (
    <main className="shell">
      <section className="feature-heading">
        <h2>샘원 관리</h2>
        <p>샘 모임 출석을 확인하고 기록합니다. 샘 리더와 마을장만 사용할 수 있습니다.</p>
      </section>
      <AttendanceBoard />
    </main>
  );
}
