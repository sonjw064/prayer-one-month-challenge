import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  buildSubmission,
  monthlyTotals,
  personStats,
  samTotals,
  totalsOf,
  villageTotals,
  weekStart,
  weekStartsBetween,
  type PersonRecord,
  type SessionRow,
} from "../../src/features/attendance/stats";
import { parseStatsParams } from "../../src/features/attendance/stats-params";
import { STREAK_ALERT, formatRate, type AttendanceStats } from "../../src/features/attendance/stats-types";
import { buildAttendanceWorkbook } from "../../src/features/attendance/stats-workbook";
import { DomainError } from "../../src/lib/http";

function session(over: Partial<SessionRow> & { date: string }): SessionRow {
  return {
    sessionId: `s-${over.date}-${over.samId ?? "x"}`,
    samId: "sam-a",
    samName: "1-1",
    village: "1",
    headcount: 10,
    present: 0,
    absent: 0,
    worshipOnly: 0,
    ...over,
  };
}

describe("totals and rates", () => {
  const rows = [
    session({ date: "2026-11-01", headcount: 10, present: 6, absent: 2, worshipOnly: 1 }),
    session({ date: "2026-11-08", samId: "sam-b", samName: "1-2", headcount: 8, present: 4, absent: 1 }),
  ];

  it("sums head counts and counts unchecked people", () => {
    const totals = totalsOf(rows);
    expect(totals).toMatchObject({
      sessions: 2, headcount: 18, present: 10, absent: 3, worshipOnly: 1, checked: 14, unchecked: 4,
    });
  });

  it("computes the three rates with the right denominators", () => {
    const totals = totalsOf(rows);
    expect(totals.presentRate).toBeCloseTo(10 / 18); // of everyone
    expect(totals.presentRateOfChecked).toBeCloseTo(10 / 14); // of people who were checked
    expect(totals.attendRate).toBeCloseTo(11 / 18); // attendance + worship only, of everyone
  });

  it("has no rate (instead of dividing by zero) when there is nothing to divide", () => {
    expect(totalsOf([])).toMatchObject({ sessions: 0, headcount: 0, presentRate: null, presentRateOfChecked: null, attendRate: null });
    const noChecks = totalsOf([session({ date: "2026-11-01", headcount: 5 })]);
    expect(noChecks.presentRate).toBe(0);
    expect(noChecks.presentRateOfChecked).toBeNull();
    expect(noChecks.unchecked).toBe(5);
  });

  it("never reports negative unchecked when more were checked than the saved head count", () => {
    expect(totalsOf([session({ date: "2026-11-01", headcount: 2, present: 3 })]).unchecked).toBe(0);
  });

  it("formats rates for display", () => {
    expect(formatRate(null)).toBe("-");
    expect(formatRate(0.8125)).toBe("81.3%");
    expect(formatRate(1)).toBe("100.0%");
  });
});

describe("grouping", () => {
  const rows = [
    session({ date: "2026-10-25", present: 5 }),
    session({ date: "2026-11-01", present: 6 }),
    session({ date: "2026-11-08", present: 7 }),
    session({ date: "2026-11-08", samId: "sam-b", samName: "2-1", village: "2", present: 4 }),
    session({ date: "2026-11-08", samId: "sam-c", samName: "10-1", village: "10", present: 3 }),
    session({ date: "2026-11-08", samId: "sam-d", samName: "특별", village: "", present: 1 }),
  ];

  it("groups by month in order", () => {
    const months = monthlyTotals(rows);
    expect(months.map((m) => m.month)).toEqual(["2026-10", "2026-11"]);
    expect(months[0].totals.present).toBe(5);
    expect(months[1].totals.present).toBe(6 + 7 + 4 + 3 + 1);
  });

  it("groups by sam with the latest name, villages in numeric order", () => {
    const sams = samTotals([...rows, session({ date: "2026-11-15", samName: "1-1(새이름)", present: 2 })]);
    expect(sams.map((s) => s.name)).toEqual(["1-1(새이름)", "2-1", "10-1", "특별"]);
    expect(sams[0].totals.sessions).toBe(4);
  });

  it("groups by village and labels a missing village", () => {
    const villages = villageTotals(rows);
    expect(villages.map((v) => v.name)).toEqual(["1마을", "2마을", "10마을", "마을 미지정"]);
    expect(villages[0].totals.sessions).toBe(3);
  });
});

describe("weeks and the submission grid", () => {
  it("runs weeks Monday to Sunday", () => {
    expect(weekStart("2026-11-02")).toBe("2026-11-02"); // Monday
    expect(weekStart("2026-11-04")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sunday belongs to the week before
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });

  it("lists the weeks of the period but never future weeks", () => {
    expect(weekStartsBetween("2026-11-01", "2026-11-30", "2026-11-12")).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(weekStartsBetween("2026-11-01", "2026-11-30", "2026-12-31")).toHaveLength(6);
  });

  it("keeps only the most recent 16 weeks of a long period", () => {
    const weeks = weekStartsBetween("2026-01-01", "2026-11-30", "2026-11-12");
    expect(weeks).toHaveLength(16);
    expect(weeks[weeks.length - 1]).toBe("2026-11-09");
  });

  it("marks which sams saved a sheet in which week", () => {
    const weeks = ["2026-10-26", "2026-11-02", "2026-11-09"];
    const targets = [
      { id: "sam-b", name: "2-1", village: "2" },
      { id: "sam-a", name: "1-1", village: "1" },
    ];
    const grid = buildSubmission(
      [
        session({ date: "2026-11-01" }), // Sunday -> week of 10/26
        session({ date: "2026-11-10" }),
        session({ date: "2026-11-04", samId: "sam-b", samName: "2-1", village: "2" }),
        session({ date: "2026-11-05", samId: null, samName: "삭제된 샘" }),
      ],
      targets,
      weeks,
    );
    expect(grid.map((row) => row.name)).toEqual(["1-1", "2-1"]);
    expect(grid[0].weeks).toEqual([true, false, true]);
    expect(grid[1].weeks).toEqual([false, true, false]);
  });
});

describe("consecutive absences", () => {
  function record(date: string, status: PersonRecord["status"], over: Partial<PersonRecord> = {}): PersonRecord {
    return { rosterId: "p1", name: "홍길동", samLabel: "1-1", samName: "1-1", village: "1", date, status, memo: "", ...over };
  }
  const weekly = (count: number, from = "2026-09-06") =>
    Array.from({ length: count }, (_, i) => record(addWeeks(from, i), "absent"));
  function addWeeks(date: string, weeks: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  }

  it("uses 5 consecutive absences as the warning threshold", () => {
    expect(STREAK_ALERT).toBe(5);
  });

  it("flags a person after 5 absences in a row, not after 4", () => {
    const four = personStats(weekly(4), "2026-09-01", "2026-10-31");
    expect(four[0]).toMatchObject({ streak: 4, alert: false });
    const five = personStats(weekly(5), "2026-09-01", "2026-10-31");
    expect(five[0]).toMatchObject({ streak: 5, alert: true, absent: 5 });
  });

  it("a present or worship-only record ends the run", () => {
    const records = [...weekly(5), record("2026-10-11", "worship_only"), record("2026-10-18", "absent"), record("2026-10-25", "absent")];
    expect(personStats(records, "2026-09-01", "2026-10-31")[0]).toMatchObject({ streak: 2, alert: false });
  });

  it("skips weeks where the person was not checked instead of breaking the run", () => {
    const records = [0, 2, 3, 5, 8].map((offset) => record(addWeeks("2026-09-06", offset), "absent"));
    expect(personStats(records, "2026-09-01", "2026-11-15")[0].streak).toBe(5);
  });

  it("finds a run that started before the selected period", () => {
    const records = weekly(6, "2026-08-02"); // 8/2 .. 9/6
    const stats = personStats(records, "2026-09-01", "2026-09-30");
    expect(stats[0]).toMatchObject({ streak: 6, alert: true, absent: 1, checked: 1 });
  });

  it("does not keep warning about an old run", () => {
    const stats = personStats(weekly(5, "2026-03-01"), "2026-10-01", "2026-10-31");
    expect(stats).toEqual([]);
  });

  it("counts statuses only inside the period and keeps the latest memo", () => {
    const records = [
      record("2026-10-04", "present", { memo: "예전 메모" }),
      record("2026-10-11", "absent", { memo: "감기" }),
      record("2026-10-18", "worship_only"),
      record("2026-12-01", "absent", { memo: "기간 밖" }),
    ];
    const [stat] = personStats(records, "2026-10-01", "2026-10-31");
    expect(stat).toMatchObject({ present: 1, absent: 1, worshipOnly: 1, checked: 3, lastMemo: "감기" });
  });

  it("lists warned people first", () => {
    const calm = record("2026-10-04", "present", { rosterId: "p2", name: "가나다" });
    const stats = personStats([...weekly(5), calm], "2026-09-01", "2026-10-31");
    expect(stats.map((s) => s.name)).toEqual(["홍길동", "가나다"]);
  });
});

describe("statistics request parameters", () => {
  const parse = (query: string) => parseStatsParams(new URLSearchParams(query), "2026-11-12");
  const bad = (query: string, code: string) => expect(() => parse(query)).toThrowError(new DomainError(code, 400));

  it("defaults to this month so far", () => {
    expect(parse("")).toEqual({ from: "2026-11-01", to: "2026-11-12", village: null, samId: null });
  });

  it("reads the period and filters", () => {
    const samId = "00000000-0000-4000-8000-0000000000a1";
    expect(parse(`from=2026-10-01&to=2026-10-31&village=2&samId=${samId}`)).toEqual({
      from: "2026-10-01", to: "2026-10-31", village: "2", samId,
    });
  });

  it("rejects bad ranges and ids", () => {
    bad("from=2026-11-10&to=2026-11-01", "INVALID_RANGE");
    bad("from=2026-02-30", "INVALID_RANGE");
    bad("from=2025-01-01&to=2026-11-12", "RANGE_TOO_LONG");
    bad("samId=nope", "INVALID_INPUT");
    bad(`village=${"가".repeat(21)}`, "INVALID_INPUT");
  });
});

describe("statistics Excel workbook", () => {
  const rows = [
    session({ date: "2026-11-01", headcount: 10, present: 6, absent: 2, worshipOnly: 1 }),
    session({ date: "2026-11-08", samId: "sam-b", samName: "2-1", village: "2", headcount: 0 }),
  ];
  const stats: AttendanceStats = {
    range: { from: "2026-11-01", to: "2026-11-30" },
    filters: { villages: ["1", "2"], sams: [] },
    totals: totalsOf(rows),
    monthly: monthlyTotals(rows),
    villages: villageTotals(rows),
    sams: samTotals(rows),
    submission: { weeks: [], rows: [] },
    people: { threshold: 5, alerts: [], rows: [] },
  };
  const detail: PersonRecord[] = [
    { rosterId: "p1", name: "홍길동", samLabel: "1-1", samName: "1-1", village: "1", date: "2026-11-01", status: "absent", memo: "감기" },
  ];
  const book = () => XLSX.read(buildAttendanceWorkbook(stats, detail), { type: "buffer", cellNF: true });

  it("has one sheet per view", () => {
    expect(book().SheetNames).toEqual(["요약", "월별", "마을별", "샘별", "개인별", "출석 기록"]);
  });

  it("writes rates as numbers with a percent format, and a dash when there is no rate", () => {
    const sheet = book().Sheets["샘별"];
    expect(sheet["H2"].v).toBeCloseTo(6 / 10);
    expect(sheet["H2"].z).toBe("0.0%");
    expect(sheet["H3"].v).toBe("-");
  });

  it("lists every record with the status label and memo", () => {
    const matrix = XLSX.utils.sheet_to_json<string[]>(book().Sheets["출석 기록"], { header: 1 });
    expect(matrix[0]).toEqual(["날짜", "마을", "샘", "이름", "구분", "메모"]);
    expect(matrix[1]).toEqual(["2026-11-01", "1", "1-1", "홍길동", "불참", "감기"]);
  });
});

describe("statistics contracts", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("both admin routes authorize first and are never cached", () => {
    for (const path of ["app/api/admin/attendance/stats/route.ts", "app/api/admin/attendance/export/route.ts"]) {
      const source = read(path);
      expect(source.indexOf("requireAdmin(")).toBeGreaterThan(-1);
      expect(source.indexOf("requireAdmin(")).toBeLessThan(source.indexOf("parseStatsParams("));
      expect(source).toContain("private, no-store");
      expect(source).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    }
  });

  it("the admin menu links to the statistics screen", () => {
    expect(read("components/admin/AdminSidebar.tsx")).toContain('href: "/admin/attendance"');
  });
});
