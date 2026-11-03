import { addDays } from "../challenge/date";
import { ATTENDANCE_LABELS, type AttendanceStatus } from "./labels";
import {
  STREAK_ALERT,
  type GroupTotals,
  type MonthTotals,
  type PersonStat,
  type SubmissionRow,
  type Totals,
} from "./stats-types";

/** Pure aggregation for the administrator statistics; the database queries live in stats-service.ts. */

/** One saved sam sheet with its status counts. */
export type SessionRow = {
  sessionId: string;
  date: string;
  samId: string | null;
  samName: string;
  village: string;
  headcount: number;
  present: number;
  absent: number;
  worshipOnly: number;
};

export type PersonRecord = {
  rosterId: string;
  name: string;
  samLabel: string | null;
  samName: string;
  village: string;
  date: string;
  status: AttendanceStatus;
  memo: string;
};

export const STREAK_RECENT_DAYS = 56;
export const MAX_GRID_WEEKS = 16;

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function totalsOf(rows: SessionRow[]): Totals {
  let headcount = 0;
  let present = 0;
  let absent = 0;
  let worshipOnly = 0;
  let unchecked = 0;
  for (const row of rows) {
    const checked = row.present + row.absent + row.worshipOnly;
    headcount += row.headcount;
    present += row.present;
    absent += row.absent;
    worshipOnly += row.worshipOnly;
    unchecked += Math.max(0, row.headcount - checked);
  }
  const checked = present + absent + worshipOnly;
  return {
    sessions: rows.length,
    headcount,
    present,
    absent,
    worshipOnly,
    checked,
    unchecked,
    presentRate: ratio(present, headcount),
    presentRateOfChecked: ratio(present, checked),
    attendRate: ratio(present + worshipOnly, headcount),
  };
}

export function monthlyTotals(rows: SessionRow[]): MonthTotals[] {
  const byMonth = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), row]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, group]) => ({ month, totals: totalsOf(group) }));
}

function villageNumber(village: string): number {
  return /^\d+$/.test(village) ? Number(village) : Number.MAX_SAFE_INTEGER;
}

function compareGroups(a: GroupTotals, b: GroupTotals): number {
  return (
    villageNumber(a.village) - villageNumber(b.village) ||
    a.village.localeCompare(b.village, "ko") ||
    a.name.localeCompare(b.name, "ko")
  );
}

export function samTotals(rows: SessionRow[]): GroupTotals[] {
  const groups = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const key = row.samId ?? `name:${row.samName}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const latest = group.reduce((a, b) => (b.date > a.date ? b : a));
      return { key, name: latest.samName, village: latest.village, totals: totalsOf(group) };
    })
    .sort(compareGroups);
}

export function villageTotals(rows: SessionRow[]): GroupTotals[] {
  const groups = new Map<string, SessionRow[]>();
  for (const row of rows) groups.set(row.village, [...(groups.get(row.village) ?? []), row]);
  return [...groups.entries()]
    .map(([village, group]) => ({
      key: village,
      name: village ? `${village}마을` : "마을 미지정",
      village,
      totals: totalsOf(group),
    }))
    .sort(compareGroups);
}

/** Monday of the week that contains the date (weeks run Monday to Sunday). */
export function weekStart(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/** Mondays of the weeks in [from, to], never beyond today, keeping the most recent `maxWeeks`. */
export function weekStartsBetween(from: string, to: string, today: string, maxWeeks = MAX_GRID_WEEKS): string[] {
  const end = weekStart(to < today ? to : today);
  const weeks: string[] = [];
  for (let week = weekStart(from); week <= end; week = addDays(week, 7)) weeks.push(week);
  return weeks.slice(-maxWeeks);
}

export type SubmissionTarget = { id: string; name: string; village: string };

/** For every sam: did it save a sheet in each week? */
export function buildSubmission(rows: SessionRow[], targets: SubmissionTarget[], weeks: string[]): SubmissionRow[] {
  const saved = new Set(
    rows.filter((row) => row.samId).map((row) => `${row.samId}:${weekStart(row.date)}`),
  );
  return targets
    .map((target) => ({
      samId: target.id,
      name: target.name,
      village: target.village,
      weeks: weeks.map((week) => saved.has(`${target.id}:${week}`)),
    }))
    .sort((a, b) =>
      villageNumber(a.village) - villageNumber(b.village) ||
      a.village.localeCompare(b.village, "ko") ||
      a.name.localeCompare(b.name, "ko"),
    );
}

function daysBetween(later: string, earlier: string): number {
  return Math.round((Date.parse(later) - Date.parse(earlier)) / 86_400_000);
}

/**
 * Per-person counts for [from, to] plus the most recent run of consecutive recorded absences.
 * The run uses every record passed in (not just the period) so a streak that started in an earlier month
 * is still found; weeks where the person was not checked are skipped rather than breaking it.
 * A person is flagged only when the run is long enough and still recent.
 */
export function personStats(records: PersonRecord[], from: string, to: string): PersonStat[] {
  const byPerson = new Map<string, PersonRecord[]>();
  for (const record of records) {
    byPerson.set(record.rosterId, [...(byPerson.get(record.rosterId) ?? []), record]);
  }

  const result: PersonStat[] = [];
  for (const list of byPerson.values()) {
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const inPeriod = ordered.filter((record) => record.date >= from && record.date <= to);

    let streak = 0;
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      if (ordered[index].status !== "absent") break;
      streak += 1;
    }
    const last = ordered[ordered.length - 1];
    const alert = streak >= STREAK_ALERT && daysBetween(to, last.date) <= STREAK_RECENT_DAYS;
    if (inPeriod.length === 0 && !alert) continue;

    const count = (status: AttendanceStatus) => inPeriod.filter((record) => record.status === status).length;
    const lastMemo = [...inPeriod].reverse().find((record) => record.memo)?.memo ?? "";
    result.push({
      rosterId: last.rosterId,
      name: last.name,
      samLabel: last.samLabel,
      present: count("present"),
      absent: count("absent"),
      worshipOnly: count("worship_only"),
      checked: inPeriod.length,
      streak,
      lastDate: last.date,
      lastMemo,
      alert,
    });
  }

  return result.sort(
    (a, b) =>
      Number(b.alert) - Number(a.alert) ||
      b.streak - a.streak ||
      b.absent - a.absent ||
      a.name.localeCompare(b.name, "ko"),
  );
}

export function statusLabel(status: AttendanceStatus): string {
  return ATTENDANCE_LABELS[status];
}
