import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("calendar contracts", () => {
  it("admin mutation routes require admin authorization and same-origin", () => {
    for (const path of ["app/api/admin/calendar/route.ts", "app/api/admin/calendar/[id]/route.ts"]) {
      const source = read(path);
      expect(source).toContain("requireAdmin");
      if (!source.includes("export async function GET")) expect(source).toContain("assertSameOrigin");
    }
  });

  it("member route requires a session and never exposes mutations", () => {
    const source = read("app/api/calendar/route.ts");
    expect(source).toContain("UNAUTHORIZED");
    expect(source).toContain("export async function GET");
    expect(source).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
  });

  it("push is sent only when the admin asked for it, and failures do not undo the save", () => {
    for (const path of ["app/api/admin/calendar/route.ts", "app/api/admin/calendar/[id]/route.ts"]) {
      const source = read(path);
      expect(source).toContain("if (input.notify)");
      expect(source).toContain('pushStatus = "failed"');
    }
  });

  it("member page checks the session and the calendar view is read-only", () => {
    expect(read("app/(member)/calendar/page.tsx")).toContain('redirect("/login")');
    const view = read("components/calendar/CalendarView.tsx");
    expect(view).not.toMatch(/method:\s*"(POST|PATCH|PUT|DELETE)"/);
  });

  it("migration locks the table down like other app tables", () => {
    const sql = read("drizzle/20261103000000_calendar_events.sql");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on prayer_app.calendar_events");
    expect(sql).toContain("calendar_events_date_order");
  });

  it("adds the calendar menus for members and admins", () => {
    expect(read("components/app/MemberSidebar.tsx")).toContain('href: "/calendar"');
    expect(read("components/admin/AdminSidebar.tsx")).toContain('href: "/admin/calendar"');
  });
});
