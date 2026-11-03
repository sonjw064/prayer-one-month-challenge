import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  ROSTER_EXPORT_HEADERS,
  buildRosterWorkbook,
  type RosterExportRow,
} from "../../src/features/admin/roster-workbook";
import {
  parseRosterWorkbookBuffer,
  validateRosterCandidates,
} from "../../src/features/roster/import";

const rows: RosterExportRow[] = [
  { name: "예시관리자", position: "목사", phone: "010-0000-0001", village: "1마을", sam: "1샘" },
  { name: "홍길동A", position: null, phone: "010-0000-0002", village: "1마을", sam: "2샘" },
  { name: "홍길동B", position: "청년", phone: "010-0000-0003", village: "2마을", sam: "1샘" },
  { name: "전화없음", position: null, phone: null, village: null, sam: null },
];

describe("roster export workbook", () => {
  it("uses the same headers as the upload parser in one sheet", () => {
    const workbook = XLSX.read(buildRosterWorkbook(rows), { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["명단"]);
    const matrix = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets["명단"], { header: 1, raw: false, defval: "" });
    expect(matrix[0]).toEqual([...ROSTER_EXPORT_HEADERS]);
    expect(matrix).toHaveLength(rows.length + 1);
  });

  it("turns on the header filter for the whole table", () => {
    const sheet = XLSX.read(buildRosterWorkbook(rows), { type: "buffer" }).Sheets["명단"];
    expect(sheet["!autofilter"]?.ref).toBe(`A1:E${rows.length + 1}`);
    const empty = XLSX.read(buildRosterWorkbook([]), { type: "buffer" }).Sheets["명단"];
    expect(empty["!autofilter"]?.ref).toBe("A1:E1");
  });

  it("stores phone numbers as text so the leading zero survives", () => {
    const workbook = XLSX.read(buildRosterWorkbook(rows), { type: "buffer" });
    const cell = workbook.Sheets["명단"]["C2"];
    expect(cell.t).toBe("s");
    expect(cell.v).toBe("010-0000-0001");
  });

  it("can be read back by the roster upload parser without losing anyone", () => {
    const parsed = parseRosterWorkbookBuffer(buildRosterWorkbook(rows));
    expect(parsed).toHaveLength(rows.length);
    expect(parsed[0]).toMatchObject({
      sourceName: "예시관리자",
      canonicalName: "예시관리자",
      position: "목사",
      phone: "01000000001",
      samLabel: "1-1",
    });
    // Namesakes keep their suffix in the file and collapse to one canonical name on upload.
    expect(parsed[1]).toMatchObject({ sourceName: "홍길동A", canonicalName: "홍길동", phone: "01000000002", samLabel: "1-2" });
    expect(parsed[2]).toMatchObject({ sourceName: "홍길동B", canonicalName: "홍길동", phone: "01000000003", samLabel: "2-1" });
    expect(parsed[3]).toMatchObject({ phone: null, village: null, sam: null, samLabel: null });
    expect(validateRosterCandidates(parsed.slice(0, 3))).toEqual({ missingPhone: 0, errors: [] });
  });

  it("builds a valid empty workbook when the roster is empty", () => {
    const workbook = XLSX.read(buildRosterWorkbook([]), { type: "buffer" });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["명단"], { header: 1 })).toEqual([[...ROSTER_EXPORT_HEADERS]]);
  });
});

describe("roster export contract", () => {
  it("route is admin-only, uncached and does not persist the file", () => {
    const source = readFileSync("app/api/admin/roster/export/route.ts", "utf8");
    expect(source).toContain("requireAdmin(");
    expect(source.indexOf("requireAdmin(")).toBeLessThan(source.indexOf("listRosterForExport("));
    expect(source).toContain("no-store");
    expect(source).toContain('runtime = "nodejs"');
    expect(source).not.toMatch(/writeFile|createWriteStream/);
  });

  it("exports every roster entry without a filter and never blanks an undecryptable phone", () => {
    const source = readFileSync("src/features/admin/roster-export.ts", "utf8");
    expect(source).not.toContain(".where(");
    expect(source).toContain("ROSTER_PHONE_DECRYPT_FAILED");
  });

  it("the user management page offers the download next to the example", () => {
    const source = readFileSync("components/admin/users/AdminUserManagement.tsx", "utf8");
    expect(source).toContain("/api/admin/roster/export");
    expect(source).toContain("/templates/community-roster-example.xlsx");
  });
});
