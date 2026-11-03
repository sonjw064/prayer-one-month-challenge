import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { attendanceRecords, attendanceSessions } from "../../db/schema";
import { todayInSeoul } from "../challenge/date";
import { reportAccessWithRoster } from "../pastoral/access";
import { ReportError, type Actor } from "../pastoral/policy";
import type { AttendanceStatus, AttendanceView } from "./labels";
import {
  allowedDateRange,
  assertDateAllowed,
  assertEntriesBelong,
  membersOfSam,
  type AttendanceSaveInput,
} from "./policy";

async function requireLeaderScope(actor: Actor) {
  const { access, roster } = await reportAccessWithRoster(actor);
  // Same people as the pastoral report tab: sam leaders, village heads and administrators.
  if (!access.visible) throw new ReportError("FORBIDDEN", 403);
  return { access, roster };
}

/** Sams this person may check, the chosen sam's people, and their saved status for the date. */
export async function loadAttendance(
  actor: Actor,
  samIdParam: string | null,
  dateParam: string | null,
): Promise<AttendanceView> {
  const { access, roster } = await requireLeaderScope(actor);
  const today = todayInSeoul();
  const date = dateParam ?? today;
  assertDateAllowed(date, actor.role, today);

  const sams = [...access.sams].sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));
  const range = allowedDateRange(actor.role, today);
  const options = sams.map((sam) => ({ id: sam.id, name: sam.name, village: sam.village }));
  if (sams.length === 0) {
    return { sams: options, sam: null, date, range, members: [], savedAt: null };
  }

  const sam = samIdParam ? sams.find((item) => item.id === samIdParam) : sams[0];
  // A sam outside the person's scope looks the same as one that does not exist.
  if (!sam) throw new ReportError("FORBIDDEN", 403);

  const people = membersOfSam(roster, sam.name);
  const db = getDb();
  const [session] = await db
    .select({ id: attendanceSessions.id, updatedAt: attendanceSessions.updatedAt })
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.meetingDate, date), eq(attendanceSessions.samId, sam.id)))
    .limit(1);
  const saved = session
    ? await db
        .select({ rosterId: attendanceRecords.rosterId, status: attendanceRecords.status, memo: attendanceRecords.memo })
        .from(attendanceRecords)
        .where(eq(attendanceRecords.sessionId, session.id))
    : [];
  const recordById = new Map(saved.map((row) => [row.rosterId, row]));

  return {
    sams: options,
    sam: { id: sam.id, name: sam.name },
    date,
    range,
    members: people.map((person) => {
      const record = recordById.get(person.id);
      return {
        ...person,
        status: (record?.status as AttendanceStatus | undefined) ?? null,
        memo: record?.memo ?? "",
      };
    }),
    savedAt: session?.updatedAt.toISOString() ?? null,
  };
}

export type SaveResult = { saved: boolean; checked: number; headcount: number; unchecked: number };

/**
 * Replaces the whole attendance sheet of one sam and date. The head count at this moment is
 * stored with it so that attendance rates keep their denominator even if the roster changes later.
 */
export async function saveAttendance(actor: Actor, input: AttendanceSaveInput): Promise<SaveResult> {
  const { access, roster } = await requireLeaderScope(actor);
  const sam = access.sams.find((item) => item.id === input.samId);
  if (!sam) throw new ReportError("FORBIDDEN", 403);
  assertDateAllowed(input.date, actor.role, todayInSeoul());

  const members = membersOfSam(roster, sam.name);
  assertEntriesBelong(input.entries, members);
  const headcount = members.length;

  return getDb().transaction(async (tx) => {
    if (input.entries.length === 0) {
      // Unchecking everyone removes the sheet instead of keeping an empty one in the statistics.
      await tx
        .delete(attendanceSessions)
        .where(and(eq(attendanceSessions.meetingDate, input.date), eq(attendanceSessions.samId, sam.id)));
      return { saved: false, checked: 0, headcount, unchecked: headcount };
    }

    const [session] = await tx
      .insert(attendanceSessions)
      .values({
        meetingDate: input.date,
        samId: sam.id,
        samName: sam.name,
        village: sam.village,
        headcount,
        savedBy: actor.id,
      })
      .onConflictDoUpdate({
        target: [attendanceSessions.meetingDate, attendanceSessions.samId],
        set: { samName: sam.name, village: sam.village, headcount, savedBy: actor.id, updatedAt: new Date() },
      })
      .returning({ id: attendanceSessions.id });

    await tx.delete(attendanceRecords).where(eq(attendanceRecords.sessionId, session.id));
    await tx.insert(attendanceRecords).values(
      input.entries.map((entry) => ({
        sessionId: session.id,
        rosterId: entry.rosterId,
        status: entry.status,
        memo: entry.memo,
      })),
    );
    return {
      saved: true,
      checked: input.entries.length,
      headcount,
      unchecked: Math.max(0, headcount - input.entries.length),
    };
  });
}
