import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { attendanceRecords, attendanceSessions, memberRoster } from "../../db/schema";
import { directory } from "../pastoral/access";
import { addDays, todayInSeoul } from "../challenge/date";
import { formatMonthKey, parseMonthKey, shiftMonth } from "../calendar/month";
import type { AttendanceStatus } from "./labels";
import { membersOfSam } from "./policy";
import {
  buildSubmission,
  monthlyTotals,
  personStats,
  samTotals,
  totalsOf,
  villageTotals,
  weekStartsBetween,
  type PersonRecord,
  type SessionRow,
} from "./stats";
import type { StatsFilter } from "./stats-params";
import { STREAK_ALERT, type AttendanceStats } from "./stats-types";

const MAX_PEOPLE_ROWS = 500;

function sessionFilter(from: string, to: string, filter: StatsFilter) {
  return and(
    gte(attendanceSessions.meetingDate, from),
    lte(attendanceSessions.meetingDate, to),
    filter.village ? eq(attendanceSessions.village, filter.village) : undefined,
    filter.samId ? eq(attendanceSessions.samId, filter.samId) : undefined,
  );
}

async function sessionRows(from: string, to: string, filter: StatsFilter): Promise<SessionRow[]> {
  return getDb()
    .select({
      sessionId: attendanceSessions.id,
      date: attendanceSessions.meetingDate,
      samId: attendanceSessions.samId,
      samName: attendanceSessions.samName,
      village: attendanceSessions.village,
      headcount: attendanceSessions.headcount,
      present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')::int`,
      absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
      worshipOnly: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'worship_only')::int`,
    })
    .from(attendanceSessions)
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .where(sessionFilter(from, to, filter))
    .groupBy(attendanceSessions.id);
}

async function personRecords(from: string, to: string, filter: StatsFilter): Promise<PersonRecord[]> {
  const rows = await getDb()
    .select({
      rosterId: attendanceRecords.rosterId,
      status: attendanceRecords.status,
      memo: attendanceRecords.memo,
      date: attendanceSessions.meetingDate,
      samName: attendanceSessions.samName,
      village: attendanceSessions.village,
      name: memberRoster.sourceName,
      samLabel: memberRoster.samLabel,
    })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .innerJoin(memberRoster, eq(attendanceRecords.rosterId, memberRoster.id))
    .where(sessionFilter(from, to, filter));
  return rows.map((row) => ({ ...row, status: row.status as AttendanceStatus }));
}

function villageOrder(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : Number.MAX_SAFE_INTEGER;
  const nb = /^\d+$/.test(b) ? Number(b) : Number.MAX_SAFE_INTEGER;
  return na - nb || a.localeCompare(b, "ko");
}

/** Statistics for the administrator screen, plus the per-record detail used by the Excel export. */
export async function loadAttendanceStats(
  filter: StatsFilter,
): Promise<{ stats: AttendanceStats; detail: PersonRecord[] }> {
  const today = todayInSeoul();
  const weeks = weekStartsBetween(filter.from, filter.to, today);
  const monthlyFrom = `${formatMonthKey(shiftMonth(parseMonthKey(filter.to.slice(0, 7))!, -11))}-01`;
  // Streaks may start before the selected period, so look back up to a year.
  const windowFrom = addDays(filter.to, -364) < filter.from ? addDays(filter.to, -364) : filter.from;
  const gridFrom = weeks[0] && weeks[0] < filter.from ? weeks[0] : filter.from;

  const [periodRows, monthlyRows, gridRows, records, data] = await Promise.all([
    sessionRows(filter.from, filter.to, filter),
    sessionRows(monthlyFrom, filter.to, filter),
    sessionRows(gridFrom, filter.to, filter),
    personRecords(windowFrom, filter.to, filter),
    directory(),
  ]);

  const activeSams = data.sams.filter((sam) => sam.isActive);
  const targets = activeSams
    .filter(
      (sam) =>
        (!filter.village || sam.village === filter.village) &&
        (!filter.samId || sam.id === filter.samId) &&
        membersOfSam(data.roster, sam.name).length > 0,
    )
    .map((sam) => ({ id: sam.id, name: sam.name, village: sam.village }));

  const people = personStats(records, filter.from, filter.to);
  const stats: AttendanceStats = {
    range: { from: filter.from, to: filter.to },
    filters: {
      villages: [...new Set(activeSams.map((sam) => sam.village).filter(Boolean))].sort(villageOrder),
      sams: activeSams
        .map((sam) => ({ id: sam.id, name: sam.name, village: sam.village }))
        .sort((a, b) => villageOrder(a.village, b.village) || a.name.localeCompare(b.name, "ko")),
    },
    totals: totalsOf(periodRows),
    monthly: monthlyTotals(monthlyRows),
    villages: villageTotals(periodRows),
    sams: samTotals(periodRows),
    submission: { weeks, rows: buildSubmission(gridRows, targets, weeks) },
    people: {
      threshold: STREAK_ALERT,
      alerts: people.filter((person) => person.alert),
      rows: people.slice(0, MAX_PEOPLE_ROWS),
    },
  };
  return {
    stats,
    detail: records
      .filter((record) => record.date >= filter.from && record.date <= filter.to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.samName.localeCompare(b.samName, "ko") || a.name.localeCompare(b.name, "ko")),
  };
}
