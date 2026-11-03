import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("attendance contracts", () => {
  it("the API requires a session first and only same-origin writes", () => {
    const source = read("app/api/attendance/route.ts");
    expect(source.indexOf("sessionActor()")).toBeGreaterThan(-1);
    const put = source.slice(source.indexOf("export async function PUT"));
    expect(put.indexOf("sessionActor()")).toBeLessThan(put.indexOf("sameOrigin("));
    expect(source).not.toMatch(/export async function (POST|PATCH|DELETE)/);
  });

  it("scope comes from the pastoral leader rules, never from request input alone", () => {
    const source = read("src/features/attendance/service.ts");
    expect(source).toContain("reportAccessWithRoster");
    expect(source).toContain("access.visible");
    // Both reading and saving must look the sam up inside the caller's allowed sams.
    expect(source.match(/access\.sams/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("assertEntriesBelong");
    expect(source).toContain("assertDateAllowed");
  });

  it("saving replaces the sheet in one transaction and stores the head count", () => {
    const source = read("src/features/attendance/service.ts");
    expect(source).toContain(".transaction(");
    expect(source).toContain("headcount");
    expect(source).toContain("onConflictDoUpdate");
    expect(source).toMatch(/\.delete\(attendanceRecords\)/);
  });

  it("migration locks both tables down and restricts statuses", () => {
    const sql = read("drizzle/20261105000000_attendance.sql");
    expect(sql).toContain("attendance_sessions_date_sam_uq");
    expect(sql).toContain("'present', 'absent', 'worship_only'");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on prayer_app.attendance_sessions, prayer_app.attendance_records");
    expect(sql).toContain("on delete cascade");
  });

  it("the menu item is limited to the people who see the pastoral tab", () => {
    const sidebar = read("components/app/MemberSidebar.tsx");
    expect(sidebar).toContain('href: "/attendance"');
    expect(sidebar).toMatch(/item\.href !== "\/attendance" \|\| pastoralVisible/);
  });

  it("the board offers exactly the three statuses and warns before losing changes", () => {
    const labels = read("src/features/attendance/labels.ts");
    expect(labels).toContain('"present", "absent", "worship_only"');
    expect(labels).toContain('present: "출석"');
    expect(labels).toContain('absent: "불참"');
    expect(labels).toContain('worship_only: "예배"');
    expect(read("components/attendance/AttendanceBoard.tsx")).toContain("저장하지 않은 체크가 있습니다");
  });

  it("notes are optional, limited to 200 characters in the database and only for checked people", () => {
    const sql = read("drizzle/20261105010000_attendance_memo.sql");
    expect(sql).toContain("add column memo text not null default ''");
    expect(sql).toContain("char_length(memo) <= 200");
    const service = read("src/features/attendance/service.ts");
    expect(service).toContain("memo: entry.memo");
    expect(service).toContain("attendanceRecords.memo");
    const board = read("components/attendance/AttendanceBoard.tsx");
    expect(board).toContain("메모 (선택)");
    expect(board).toMatch(/\{current && \(\s*<input/);
    expect(board).toContain("MAX_MEMO_LENGTH");
  });

  it("the privacy policy mentions attendance information", () => {
    expect(read("app/(public)/privacy/page.tsx")).toContain("샘 출석");
  });
});
