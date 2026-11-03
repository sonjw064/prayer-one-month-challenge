import { describe, expect, it } from "vitest";
import {
  allowedDateRange,
  assertDateAllowed,
  assertEntriesBelong,
  countStatuses,
  isDateKey,
  membersOfSam,
  parseAttendanceSave,
} from "../../src/features/attendance/policy";
import { DomainError } from "../../src/lib/http";
import type { Identity } from "../../src/features/pastoral/policy";

const SAM = "00000000-0000-4000-8000-0000000000a1";
const P1 = "00000000-0000-4000-8000-0000000000b1";
const P2 = "00000000-0000-4000-8000-0000000000b2";

function person(id: string, name: string, samLabel: string | null, isActive = true): Identity {
  return { id, sourceName: name, canonicalName: name, samLabel, village: "1", isActive };
}

describe("attendance dates", () => {
  it("recognizes real dates only", () => {
    expect(isDateKey("2026-11-05")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("20261105")).toBe(false);
  });

  it("limits leaders to today and the last 8 weeks, but not administrators", () => {
    expect(allowedDateRange("member", "2026-11-05")).toEqual({ min: "2026-09-10", max: "2026-11-05" });
    expect(allowedDateRange("admin", "2026-11-05").max).toBe("2026-11-05");
    expect(allowedDateRange("admin", "2026-11-05").min < "2020-01-01").toBe(true);
  });

  it("rejects the future, too-old dates for leaders, and invalid dates", () => {
    const reject = (date: string, code: string, role: "member" | "admin" = "member") =>
      expect(() => assertDateAllowed(date, role, "2026-11-05")).toThrowError(new DomainError(code, 400));
    reject("2026-11-06", "DATE_NOT_ALLOWED");
    reject("2026-11-06", "DATE_NOT_ALLOWED", "admin");
    reject("2026-09-09", "DATE_NOT_ALLOWED");
    reject("nope", "INVALID_DATE");
    expect(() => assertDateAllowed("2026-09-10", "member", "2026-11-05")).not.toThrow();
    expect(() => assertDateAllowed("2026-11-05", "member", "2026-11-05")).not.toThrow();
    expect(() => assertDateAllowed("2025-01-01", "admin", "2026-11-05")).not.toThrow();
  });
});

describe("members of a sam", () => {
  const roster = [
    person("1", "박길동", "1-2"),
    person("2", "김철수", "1-2"),
    person("3", "이영희", "1-3"),
    person("4", "최퇴장", "1-2", false),
    person("5", "무소속", null),
    person("6", "한 변형", "1마을 2샘"),
  ];

  it("lists active people of that sam, sorted by name, leader included", () => {
    expect(membersOfSam(roster, "1-2").map((m) => m.name)).toEqual(["김철수", "박길동", "한 변형"]);
  });

  it("matches sam names written in different forms", () => {
    expect(membersOfSam(roster, "1마을-2샘").map((m) => m.id)).toEqual(["2", "1", "6"]);
  });

  it("returns nobody for an unknown or empty sam, and never people without a sam", () => {
    expect(membersOfSam(roster, "9-9")).toEqual([]);
    expect(membersOfSam(roster, "")).toEqual([]);
  });
});

describe("saving attendance input", () => {
  const base = { samId: SAM, date: "2026-11-05", entries: [{ rosterId: P1, status: "present" }] };
  const invalid = (raw: unknown) =>
    expect(() => parseAttendanceSave(raw)).toThrowError(new DomainError("INVALID_INPUT", 400));

  it("accepts the three statuses", () => {
    const parsed = parseAttendanceSave({
      ...base,
      entries: [
        { rosterId: P1, status: "present" },
        { rosterId: P2, status: "worship_only" },
      ],
    });
    expect(parsed.entries.map((entry) => entry.status)).toEqual(["present", "worship_only"]);
    expect(parseAttendanceSave({ ...base, entries: [{ rosterId: P1, status: "absent" }] }).entries).toHaveLength(1);
  });

  it("accepts an empty sheet, which clears the day", () => {
    expect(parseAttendanceSave({ ...base, entries: [] }).entries).toEqual([]);
  });

  it("rejects unknown statuses, bad ids, bad dates, duplicates and oversized sheets", () => {
    invalid(null);
    invalid({ ...base, entries: [{ rosterId: P1, status: "late" }] });
    invalid({ ...base, entries: [{ rosterId: "x", status: "present" }] });
    invalid({ ...base, samId: "x" });
    invalid({ ...base, date: "2026-13-01" });
    invalid({ ...base, entries: [{ rosterId: P1, status: "present" }, { rosterId: P1, status: "absent" }] });
    invalid({ ...base, entries: Array.from({ length: 301 }, (_, i) => ({ rosterId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, status: "present" })) });
  });

  it("only allows people who belong to the sam", () => {
    const members = [{ id: P1, name: "박길동" }];
    expect(() => assertEntriesBelong([{ rosterId: P1, status: "present" }], members)).not.toThrow();
    expect(() => assertEntriesBelong([{ rosterId: P2, status: "present" }], members)).toThrowError(
      new DomainError("MEMBER_NOT_IN_SAM", 400),
    );
  });
});

describe("counting statuses", () => {
  it("counts each status and the unchecked remainder", () => {
    expect(countStatuses(6, ["present", "present", "absent", "worship_only", null, null])).toEqual({
      present: 2,
      absent: 1,
      worshipOnly: 1,
      unchecked: 2,
      headcount: 6,
    });
  });

  it("never reports a negative unchecked count", () => {
    expect(countStatuses(1, ["present", "absent"]).unchecked).toBe(0);
  });
});
