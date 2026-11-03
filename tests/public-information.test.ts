import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pages = [
  ["app/(public)/about/page.tsx", "3D"],
  ["app/(public)/privacy/page.tsx", "개인정보처리방침"],
] as const;

describe("public app information", () => {
  it.each(pages)("provides %s outside the authenticated member layout", (path, title) => {
    expect(existsSync(path), `Missing public route: ${path}`).toBe(true);
    const source = readFileSync(path, "utf8");
    expect(source).toContain(title);
    expect(source).not.toMatch(/getCurrentSessionUser|requireAdmin|getDb\(|redirect\(/);
  });

  it("makes both public pages discoverable before login", () => {
    const source = readFileSync("app/login/page.tsx", "utf8");
    expect(source).toContain('href="/about"');
    expect(source).toContain('href="/privacy"');
  });
});
