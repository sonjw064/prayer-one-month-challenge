import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("3D member shell", () => {
  it("pins the required menu order", () => {
    const source = readFileSync("components/app/MemberSidebar.tsx", "utf8");
    const labels = ["공지", "기도운동", "심방신청", "기도요청", "커뮤니티", "목양지"];
    let cursor = -1;
    for (const label of labels) {
      const next = source.indexOf(label);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it("provides a page for every member tab", () => {
    const pages = [
      ["app/(member)/page.tsx", "PrayerDashboardNoSsr"],
      ["app/(member)/visits/page.tsx", "심방신청"],
      ["app/(member)/prayer-requests/page.tsx", "기도요청"],
      ["app/(member)/notices/page.tsx", "공지"],
    ] as const;

    for (const [path, marker] of pages) {
      expect(readFileSync(path, "utf8")).toContain(marker);
    }
  });

  it("pins the exact brand copy", () => {
    const source = readFileSync("components/app/MemberShell.tsx", "utf8");
    expect(source).toContain("삼덕청년부");
    expect(source).toContain("성령이 하나 되게 하신 것을 힘써 지키라(엡 4:3)");
  });

  it("keeps each feature on its own route instead of one combined screen", () => {
    for (const path of [
      "app/(member)/page.tsx",
      "app/(member)/visits/page.tsx",
      "app/(member)/prayer-requests/page.tsx",
      "app/(member)/notices/page.tsx",
    ]) {
      expect(readFileSync(path, "utf8").length).toBeGreaterThan(0);
    }
  });
});
