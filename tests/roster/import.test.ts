import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import {
  importRosterCandidates,
  parseRosterWorkbook,
  parseRosterWorkbookBuffer,
  planRosterImport,
  previewRosterImport,
  validateRosterCandidates,
  type ExistingRosterRow,
  type ImportCandidate,
  type PreparedRosterRow,
  type RosterImportRepository,
} from "../../src/features/roster/import";

function workbookFile(rows: string[][]) {
  const sheet = utils.aoa_to_sheet(rows);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "명단");
  const dir = mkdtempSync(join(tmpdir(), "roster-"));
  const file = join(dir, "fixture.xls");
  writeFileSync(file, write(workbook, { type: "buffer", bookType: "xls" }));
  return file;
}

describe("legacy XLS roster import parsing", () => {
  it("parses required columns and canonicalizes names and sam labels", () => {
    const file = workbookFile([
      ["이름", "교회직분", "핸드폰", "마을", "샘"],
      ["김은희A", "집사", "010-1234-5678", "1마을", "6샘"],
      ["김은희B", "권사", "010-9999-0000", "2마을", "3샘"],
      ["전화없음", "성도", "", "1마을", "7샘"],
    ]);

    const rows = parseRosterWorkbook(file);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      sourceRow: 2,
      sourceName: "김은희A",
      canonicalName: "김은희",
      position: "집사",
      phone: "01012345678",
      village: "1마을",
      sam: "6샘",
      samLabel: "1-6",
    });
    expect(rows[2].phone).toBeNull();
    expect(rows[2].samLabel).toBe("1-7");
  });

  it("parses the same workbook from an in-memory upload buffer", () => {
    const file = workbookFile([
      ["이름", "교회직분", "핸드폰", "마을", "샘"],
      ["김은희A", "집사", "010-1234-5678", "1마을", "06샘"],
    ]);
    const buffer = readFileSync(file);
    expect(parseRosterWorkbookBuffer(buffer)[0]).toMatchObject({
      canonicalName: "김은희",
      phone: "01012345678",
      samLabel: "1-6",
    });
  });

  it("accepts defensive header aliases", () => {
    const file = workbookFile([
      ["이름", "직분", "핸드폰 번호", "마을", "샘"],
      ["테스트A", "집사", "010-1111-2222", "3마을", "2샘"],
    ]);
    expect(parseRosterWorkbook(file)[0].canonicalName).toBe("테스트");
  });

  it("rejects a workbook missing a required header", () => {
    const file = workbookFile([
      ["이름", "교회직분", "핸드폰", "마을"],
      ["테스트", "집사", "010-1111-2222", "3마을"],
    ]);
    expect(() => parseRosterWorkbook(file)).toThrow("ROSTER_HEADERS_MISSING");
  });

  it("reports blank phones as warnings but duplicate credentials as fatal", () => {
    const rows = [
      {
        sourceRow: 2,
        sourceName: "김은희A",
        canonicalName: "김은희",
        position: "집사",
        phone: "01012345678",
        village: "1마을",
        sam: "6샘",
        samLabel: "1-6",
      },
      {
        sourceRow: 3,
        sourceName: "김은희B",
        canonicalName: "김은희",
        position: "권사",
        phone: "01012345678",
        village: "2마을",
        sam: "3샘",
        samLabel: "2-3",
      },
      {
        sourceRow: 4,
        sourceName: "전화없음",
        canonicalName: "전화없음",
        position: "성도",
        phone: null,
        village: "1마을",
        sam: "7샘",
        samLabel: "1-7",
      },
    ];

    const result = validateRosterCandidates(rows);
    expect(result.missingPhone).toBe(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "DUPLICATE_CREDENTIAL" }),
    ]);
  });
});


function setEnv() {
  process.env.DATABASE_URL = "postgres://example";
  process.env.SESSION_SECRET = "s".repeat(32);
  process.env.PHONE_LOOKUP_PEPPER = "p".repeat(32);
  process.env.ROSTER_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
}

function existing(overrides: Partial<ExistingRosterRow> & { id: string }): ExistingRosterRow {
  return {
    canonicalName: "홍길동",
    phoneLookupHash: "h1",
    position: null,
    village: null,
    sam: null,
    samLabel: null,
    isActive: true,
    isAdmin: false,
    ...overrides,
  };
}

function prepared(overrides: Partial<PreparedRosterRow> = {}): PreparedRosterRow {
  return {
    sourceRow: 2,
    sourceName: "홍길동",
    canonicalName: "홍길동",
    position: null,
    phoneLookupHash: "h1",
    phoneCiphertext: "cipher",
    village: null,
    sam: null,
    samLabel: null,
    isActive: true,
    isAdmin: false,
    source: "xls",
    ...overrides,
  };
}

function candidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return {
    sourceRow: 2,
    sourceName: "홍길동",
    canonicalName: "홍길동",
    position: "집사",
    phone: "01012345678",
    village: "1마을",
    sam: "6샘",
    samLabel: "1-6",
    ...overrides,
  };
}

/** A repository backed by an in-memory roster that records whether anything was applied. */
function fakeRepository(roster: ExistingRosterRow[]) {
  const applied: PreparedRosterRow[][] = [];
  const repository: RosterImportRepository = {
    loadRoster: async () => roster,
    applyRoster: async (rows) => {
      applied.push(rows);
      return planRosterImport(roster, rows);
    },
  };
  return { repository, applied };
}

describe("planning a roster import (add and update only)", () => {
  it("adds people who are not on the roster and never removes anyone", () => {
    const plan = planRosterImport(
      [existing({ id: "a" }), existing({ id: "b", canonicalName: "김철수", phoneLookupHash: "h2" })],
      [prepared({ canonicalName: "박새로", sourceName: "박새로", phoneLookupHash: "h9" })],
    );
    expect(plan.adds.map((row) => row.canonicalName)).toEqual(["박새로"]);
    expect(plan.updates).toEqual([]);
    expect(plan.notInFile).toBe(2);
  });

  it("matches by name and phone and fills in position, village and sam", () => {
    const plan = planRosterImport(
      [existing({ id: "a" })],
      [prepared({ position: "집사", village: "1마을", sam: "6샘", samLabel: "1-6" })],
    );
    expect(plan.adds).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].existing.id).toBe("a");
    expect(plan.updates[0].values).toEqual({ position: "집사", village: "1마을", sam: "6샘", samLabel: "1-6" });
    expect(plan.updates[0].changes.map((change) => change.field)).toEqual(["position", "village", "sam"]);
    expect(plan.notInFile).toBe(0);
  });

  it("does not erase existing values with blank cells and recomputes the sam label from merged values", () => {
    const plan = planRosterImport(
      [existing({ id: "a", position: "집사", village: "1마을", sam: "6샘", samLabel: "1-6" })],
      [prepared({ position: null, village: "2마을", sam: null, samLabel: null })],
    );
    expect(plan.updates[0].values).toEqual({ position: "집사", village: "2마을", sam: "6샘", samLabel: "2-6" });
    expect(plan.updates[0].changes).toEqual([{ field: "village", before: "1마을", after: "2마을" }]);
  });

  it("reports identical people as unchanged", () => {
    const plan = planRosterImport(
      [existing({ id: "a", position: "집사", village: "1마을", sam: "6샘", samLabel: "1-6" })],
      [prepared({ position: "집사", village: "1마을", sam: "6샘", samLabel: "1-6" })],
    );
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.updates).toEqual([]);
  });

  it("never changes active state and never demotes an administrator", () => {
    const plan = planRosterImport(
      [existing({ id: "a", isAdmin: true, isActive: false })],
      [prepared({ position: "집사", isAdmin: false, isActive: true })],
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].promote).toBe(false);
    expect(Object.keys(plan.updates[0].values)).not.toContain("isAdmin");
    expect(Object.keys(plan.updates[0].values)).not.toContain("isActive");
  });

  it("promotes only when the file marks the initial administrator", () => {
    const plan = planRosterImport([existing({ id: "a" })], [prepared({ isAdmin: true })]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].promote).toBe(true);
    expect(plan.updates[0].changes).toEqual([]);
  });

  it("treats the same name with a different phone as a different person", () => {
    const plan = planRosterImport([existing({ id: "a" })], [prepared({ phoneLookupHash: "h2" })]);
    expect(plan.adds).toHaveLength(1);
    expect(plan.notInFile).toBe(1);
  });

  it("matches a phone-less person only when the name is unambiguous", () => {
    const one = existing({ id: "a", canonicalName: "무번호", phoneLookupHash: null });
    const row = prepared({ canonicalName: "무번호", sourceName: "무번호", phoneLookupHash: null, position: "성도" });

    expect(planRosterImport([one], [row]).updates[0].existing.id).toBe("a");
    expect(planRosterImport([], [row]).adds).toHaveLength(1);

    const twoExisting = [one, existing({ id: "b", canonicalName: "무번호", phoneLookupHash: null })];
    const ambiguousExisting = planRosterImport(twoExisting, [row]);
    expect(ambiguousExisting.skipped).toHaveLength(1);
    expect(ambiguousExisting.adds).toEqual([]);

    const ambiguousFile = planRosterImport([one], [row, { ...row, sourceRow: 3 }]);
    expect(ambiguousFile.skipped).toHaveLength(2);
    expect(ambiguousFile.updates).toEqual([]);
  });
});

describe("roster import service", () => {
  it("does not call the repository when duplicate credentials exist", async () => {
    setEnv();
    const { repository, applied } = fakeRepository([]);
    const rows = [
      candidate({ sourceRow: 2, sourceName: "김은희A", canonicalName: "김은희" }),
      candidate({ sourceRow: 3, sourceName: "김은희B", canonicalName: "김은희" }),
    ];
    await expect(importRosterCandidates(rows, { repository })).rejects.toThrow("ROSTER_VALIDATION_FAILED");
    await expect(previewRosterImport(rows, { repository })).rejects.toThrow("ROSTER_VALIDATION_FAILED");
    expect(applied).toHaveLength(0);
  });

  it("returns a count-only summary and hides raw phone numbers", async () => {
    setEnv();
    const { repository, applied } = fakeRepository([]);
    const summary = await importRosterCandidates(
      [candidate(), candidate({ sourceRow: 3, sourceName: "전화없음", canonicalName: "전화없음", phone: null, village: null, sam: null, samLabel: null })],
      { repository },
    );
    expect(summary).toEqual({ total: 2, added: 2, updated: 0, unchanged: 0, skipped: 0, notInFile: 0, missingPhone: 1 });
    expect(JSON.stringify(summary)).not.toContain("01012345678");
    expect(applied[0][0]).toMatchObject({ phoneLookupHash: expect.stringMatching(/^[a-f0-9]{64}$/), isAdmin: false });
    expect(JSON.stringify(applied[0][0])).not.toContain("01012345678");
    expect(applied[0][1]).toMatchObject({ phoneLookupHash: null, phoneCiphertext: null });
  });

  it("needs no administrator in the file for a normal upload", async () => {
    setEnv();
    const { repository } = fakeRepository([]);
    await expect(importRosterCandidates([candidate()], { repository })).resolves.toMatchObject({ added: 1 });
  });

  it("marks the initial administrator by name and phone hash, and requires that person in the file", async () => {
    setEnv();
    const { phoneLookupHash } = await import("../../src/features/auth/crypto");
    const { repository, applied } = fakeRepository([]);
    const adminCredential = { canonicalName: "홍길동", phoneLookupHash: phoneLookupHash("01012345678") };

    await importRosterCandidates([candidate()], { adminCredential, repository });
    expect(applied[0][0]).toMatchObject({ isAdmin: true });

    const other = fakeRepository([]);
    await expect(
      importRosterCandidates([candidate({ canonicalName: "다른사람", sourceName: "다른사람" })], {
        adminCredential,
        repository: other.repository,
      }),
    ).rejects.toThrow("INITIAL_ADMIN_NOT_FOUND");
    expect(other.applied).toHaveLength(0);
  });

  it("previews without applying and describes the changes", async () => {
    setEnv();
    const { phoneLookupHash } = await import("../../src/features/auth/crypto");
    const roster = [
      existing({ id: "a", phoneLookupHash: phoneLookupHash("01012345678"), village: "1마을" }),
      existing({ id: "z", canonicalName: "파일에없음", phoneLookupHash: "hz" }),
    ];
    const { repository, applied } = fakeRepository(roster);

    const preview = await previewRosterImport(
      [candidate(), candidate({ sourceRow: 3, sourceName: "새사람", canonicalName: "새사람", phone: "01099990000" })],
      { repository },
    );

    expect(applied).toHaveLength(0);
    expect(preview.summary).toEqual({ total: 2, added: 1, updated: 1, unchanged: 0, skipped: 0, notInFile: 1, missingPhone: 0 });
    expect(preview.added).toEqual([{ name: "새사람" }]);
    expect(preview.updated).toEqual([
      { name: "홍길동", changes: ["직분: 없음 → 집사", "샘: 없음 → 6샘"] },
    ]);
  });
});
