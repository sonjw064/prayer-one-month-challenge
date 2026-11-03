import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("split admin management", () => {
  it("keeps XLS import, bulk deletion, and password reset in user management", () => {
    const source = readFileSync(
      "components/admin/users/AdminUserManagement.tsx",
      "utf8",
    );
    expect(source).toContain("RosterImportPanel");
    expect(readFileSync("components/admin/users/RosterImportPanel.tsx", "utf8")).toContain("/api/admin/roster/import");
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("/api/admin/roster/password");
  });

  it("keeps challenge editing in prayer management", () => {
    const source = readFileSync(
      "components/admin/prayer/AdminPrayerManagement.tsx",
      "utf8",
    );
    expect(source).toContain("/api/admin/challenge");
    expect(source).toContain("도전 설정");
  });
});
