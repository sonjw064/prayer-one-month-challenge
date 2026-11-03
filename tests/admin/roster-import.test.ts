import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import {
  MAX_ROSTER_FILE_BYTES,
  importRosterUploadBuffer,
  previewRosterUploadBuffer,
  validateRosterUploadMeta,
} from "../../src/features/admin/roster-import-service";
import { planRosterImport } from "../../src/features/roster/import";

function workbookBuffer() {
  const sheet = utils.aoa_to_sheet([
    ["이름", "교회직분", "핸드폰", "마을", "샘"],
    ["관리자A", "부목사", "010-1234-5678", "1마을", "06샘"],
    ["회원B", "집사", "010-9999-0000", "2마을", "03샘"],
  ]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "명단");
  return Buffer.from(write(workbook, { type: "buffer", bookType: "xls" }));
}

describe("admin roster upload boundary", () => {
  it("accepts a legacy xls within the size limit", () => {
    expect(() =>
      validateRosterUploadMeta({ name: "56공동체.xls", size: 74240 }),
    ).not.toThrow();
  });

  it("accepts xlsx templates and rejects other files and oversized uploads", () => {
    expect(() =>
      validateRosterUploadMeta({ name: "roster.xlsx", size: 1000 }),
    ).not.toThrow();
    expect(() =>
      validateRosterUploadMeta({ name: "roster.csv", size: 1000 }),
    ).toThrow("ROSTER_FILE_TYPE");
    expect(() =>
      validateRosterUploadMeta({
        name: "roster.xls",
        size: MAX_ROSTER_FILE_BYTES + 1,
      }),
    ).toThrow("ROSTER_FILE_TOO_LARGE");
  });

  it("imports a buffer without needing an administrator in the file", async () => {
    process.env.DATABASE_URL = "postgres://example";
    process.env.SESSION_SECRET = "s".repeat(32);
    process.env.PHONE_LOOKUP_PEPPER = "p".repeat(32);
    process.env.ROSTER_ENCRYPTION_KEY = Buffer.alloc(32, 12).toString("base64");

    const prepared: Array<{ isAdmin: boolean; samLabel: string | null }> = [];
    const summary = await importRosterUploadBuffer({
      buffer: workbookBuffer(),
      repository: {
        loadRoster: async () => [],
        applyRoster: async (rows) => {
          prepared.push(...rows);
          return planRosterImport([], rows);
        },
      },
    });

    expect(summary).toEqual({
      total: 2,
      added: 2,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      notInFile: 0,
      missingPhone: 0,
    });
    expect(prepared[0]).toMatchObject({ isAdmin: false, samLabel: "1-6" });
    expect(prepared[1]).toMatchObject({ isAdmin: false, samLabel: "2-3" });
  });

  it("previews an uploaded buffer without applying it", async () => {
    let applied = 0;
    const preview = await previewRosterUploadBuffer({
      buffer: workbookBuffer(),
      repository: {
        loadRoster: async () => [],
        applyRoster: async (rows) => {
          applied += 1;
          return planRosterImport([], rows);
        },
      },
    });
    expect(applied).toBe(0);
    expect(preview.summary).toMatchObject({ total: 2, added: 2, updated: 0 });
    expect(preview.added).toEqual([{ name: "관리자A" }, { name: "회원B" }]);
  });
});

describe("roster import contract", () => {
  it("the route supports a preview mode and no longer depends on the uploading admin being in the file", () => {
    const source = readFileSync("app/api/admin/roster/import/route.ts", "utf8");
    expect(source).toContain("requireAdmin(");
    expect(source).toContain('form.get("mode") === "preview"');
    expect(source).toContain("RosterValidationError");
    expect(source).not.toMatch(/adminCredential|INITIAL_ADMIN_NOT_FOUND|ROSTER_ADMIN_CONFLICT/);
    expect(source).not.toMatch(/writeFile|createWriteStream/);
  });

  it("both admin screens use the shared preview-first import panel", () => {
    for (const path of ["components/admin/users/AdminUserManagement.tsx", "components/admin/AdminDashboard.tsx"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("RosterImportPanel");
      expect(source).not.toContain('"/api/admin/roster/import"');
    }
    const panel = readFileSync("components/admin/users/RosterImportPanel.tsx", "utf8");
    expect(panel).toContain('"preview"');
    expect(panel).toContain("이대로 가져오기");
  });

  it("uploads never delete roster rows or touch active/admin state for existing people", () => {
    const source = readFileSync("src/features/roster/import.ts", "utf8");
    const apply = source.slice(source.indexOf("async applyRoster"), source.indexOf("type ImportOptions"));
    expect(apply).not.toMatch(/\.delete\(/);

    // The roster update for an existing person only writes the planned values (+ promotion), never isActive.
    const start = apply.indexOf(".update(memberRoster)");
    const rosterUpdate = apply.slice(start, apply.indexOf(".where(", start));
    expect(rosterUpdate).toContain("...update.values");
    expect(rosterUpdate).toContain("update.promote");
    expect(rosterUpdate).not.toContain("isActive");
    expect(rosterUpdate).not.toMatch(/isAdmin:\s*(false|row)/);
  });
});
