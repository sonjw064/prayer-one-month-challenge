import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRegistrationChange, parseResetRequest } from "../../src/features/sams/registrations-policy";
import { CONFIRM_DELETE, CONFIRM_RESET, canDeleteSam } from "../../src/features/sams/registrations-types";
import { DomainError } from "../../src/lib/http";

const ID1 = "00000000-0000-4000-8000-0000000000a1";
const ID2 = "00000000-0000-4000-8000-0000000000a2";
const read = (path: string) => readFileSync(path, "utf8");

describe("registration change input", () => {
  const bad = (raw: unknown, code = "INVALID_INPUT") =>
    expect(() => parseRegistrationChange(raw)).toThrowError(new DomainError(code, 400));

  it("accepts delete, archive and restore for sams and villages and removes duplicate ids", () => {
    expect(parseRegistrationChange({ kind: "sam", action: "archive", ids: [ID1, ID1, ID2] }).ids).toEqual([ID1, ID2]);
    expect(parseRegistrationChange({ kind: "village", action: "restore", ids: [ID1] })).toMatchObject({ kind: "village", action: "restore" });
  });

  it("rejects unknown kinds and actions, bad ids, empty and oversized lists", () => {
    bad(null);
    bad({ kind: "user", action: "archive", ids: [ID1] });
    bad({ kind: "sam", action: "purge", ids: [ID1] });
    bad({ kind: "sam", action: "archive", ids: ["x"] });
    bad({ kind: "sam", action: "archive", ids: [] });
    bad({
      kind: "sam",
      action: "archive",
      ids: Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`),
    });
  });

  it("requires the typed word only when deleting more than one registration", () => {
    bad({ kind: "sam", action: "delete", ids: [ID1, ID2] }, "CONFIRM_REQUIRED");
    bad({ kind: "sam", action: "delete", ids: [ID1, ID2], confirm: "yes" }, "CONFIRM_REQUIRED");
    expect(parseRegistrationChange({ kind: "sam", action: "delete", ids: [ID1, ID2], confirm: ` ${CONFIRM_DELETE} ` }).ids).toHaveLength(2);
    expect(parseRegistrationChange({ kind: "sam", action: "delete", ids: [ID1] }).ids).toEqual([ID1]);
    expect(parseRegistrationChange({ kind: "sam", action: "archive", ids: [ID1, ID2] }).ids).toHaveLength(2);
  });

  it("counts duplicates before deciding whether the typed word is needed", () => {
    expect(parseRegistrationChange({ kind: "village", action: "delete", ids: [ID1, ID1] }).ids).toEqual([ID1]);
  });
});

describe("new-year reset request", () => {
  it("only runs with the exact confirmation word", () => {
    expect(() => parseResetRequest({ confirm: CONFIRM_RESET })).not.toThrow();
    expect(() => parseResetRequest({ confirm: ` ${CONFIRM_RESET} ` })).not.toThrow();
    for (const raw of [null, {}, { confirm: "" }, { confirm: "삭제" }, { confirm: 1 }]) {
      expect(() => parseResetRequest(raw)).toThrowError(new DomainError("CONFIRM_REQUIRED", 400));
    }
  });
});

describe("which sams can be deleted", () => {
  it("only sams without pastoral reports", () => {
    expect(canDeleteSam({ reports: 0 })).toBe(true);
    expect(canDeleteSam({ reports: 3 })).toBe(false);
  });
});

describe("registration cleanup contracts", () => {
  it("every route authorizes first and is never cached", () => {
    for (const path of ["app/api/admin/registrations/route.ts", "app/api/admin/roster/reset-groups/route.ts"]) {
      const source = read(path);
      const first = source.indexOf("requireAdmin(");
      expect(first, path).toBeGreaterThan(-1);
      for (const later of ["assertSameOrigin(", "parseRegistrationChange(", "parseResetRequest(", "resetRosterGroups(", "changeSams(", "listRegistrations("]) {
        const index = source.indexOf(later, source.indexOf("export async function"));
        if (index >= 0) expect(first, `${path} ${later}`).toBeLessThan(index);
      }
      expect(source).toContain("private, no-store");
    }
  });

  it("deleting a sam skips sams with pastoral reports and clears the legacy user link", () => {
    const source = read("src/features/sams/registrations.ts");
    expect(source).toContain("not exists (select 1 from prayer_app.pastoral_reports");
    expect(source.indexOf("set({ samId: null })")).toBeLessThan(source.indexOf("tx.delete(sams)"));
  });

  it("the new-year reset clears only village and sam", () => {
    const source = read("src/features/sams/registrations.ts");
    const reset = source.slice(source.indexOf("export async function resetRosterGroups"));
    expect(reset).toContain("village: null, sam: null, samLabel: null");
    for (const kept of ["isActive", "isAdmin", "phone", "position", "sourceName", "canonicalName", "passwordHash"]) {
      expect(reset, kept).not.toContain(kept);
    }
  });

  it("the list includes archived and leader-less sams and the screen is on the users page", () => {
    const service = read("src/features/sams/registrations.ts");
    expect(service).toContain("data.sams");
    expect(service).not.toMatch(/leaderName\s*(!==|!=)\s*["']{2}/);
    expect(read("app/admin/users/page.tsx")).toContain("RegistrationCleanup");
    const ui = read("components/admin/settings/RegistrationCleanup.tsx");
    expect(ui).toContain("CONFIRM_DELETE");
    expect(ui).toContain("CONFIRM_RESET");
    expect(ui).toContain("삭제 가능한 샘만 선택");
  });
});
