import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("admin shell", () => {
  it("pins the approved admin menu order", () => {
    const source = readFileSync("components/admin/AdminSidebar.tsx", "utf8");
    const labels = [
      "대시보드",
      "공지 관리",
      "일정 관리",
      "기도운동 관리",
      "심방 신청 관리",
      "기도요청 관리",
      "커뮤니티 관리",
      "목양지 관리",
      "샘원 관리",
      "사용자 관리",
    ];
    let cursor = -1;
    for (const label of labels) {
      const next = source.indexOf(label);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it("keeps admin authorization in the shared admin layout", () => {
    const source = readFileSync("app/admin/layout.tsx", "utf8");
    expect(source).toContain("getCurrentSessionUser");
    expect(source).toContain("requireAdmin");
  });
});
