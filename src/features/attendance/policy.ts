import { z } from "zod";
import { DomainError } from "../../lib/http";
import { addDays } from "../challenge/date";
import { samKey, type Identity } from "../pastoral/policy";
import { ATTENDANCE_STATUSES, MAX_MEMO_LENGTH, type AttendanceStatus } from "./labels";

/** Sam leaders and village heads may enter or fix attendance for today and this many days back (8 weeks). */
export const LEADER_EDIT_DAYS = 56;
export const MAX_ENTRIES = 300;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Administrators have no lower bound; nobody can record the future. */
export function allowedDateRange(role: "member" | "admin", today: string): { min: string; max: string } {
  return { min: role === "admin" ? "2000-01-01" : addDays(today, -LEADER_EDIT_DAYS), max: today };
}

export function assertDateAllowed(date: string, role: "member" | "admin", today: string): void {
  if (!isDateKey(date)) throw new DomainError("INVALID_DATE", 400);
  const { min, max } = allowedDateRange(role, today);
  if (date < min || date > max) throw new DomainError("DATE_NOT_ALLOWED", 400);
}

export type SamMember = { id: string; name: string };

/** Everyone whose roster `sam` is this sam and who is still active (the leader is included). */
export function membersOfSam(roster: Identity[], samName: string): SamMember[] {
  const key = samKey(samName);
  if (!key) return [];
  return roster
    .filter((person) => person.isActive && samKey(person.samLabel) === key)
    .map((person) => ({ id: person.id, name: person.sourceName }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));
}

export type AttendanceEntry = { rosterId: string; status: AttendanceStatus; memo: string };

// No control characters; the note is a single line of at most MAX_MEMO_LENGTH characters.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

const saveSchema = z.object({
  samId: z.string().uuid(),
  date: z.string().refine(isDateKey),
  entries: z
    .array(
      z.object({
        rosterId: z.string().uuid(),
        status: z.enum(ATTENDANCE_STATUSES),
        memo: z.string().max(MAX_MEMO_LENGTH * 2).nullish(),
      }),
    )
    .max(MAX_ENTRIES),
});

function cleanMemo(value: string | null | undefined): string {
  const text = (value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
  if (text.length > MAX_MEMO_LENGTH || CONTROL_CHARS.test(text)) throw new DomainError("INVALID_INPUT", 400);
  return text;
}

export type AttendanceSaveInput = { samId: string; date: string; entries: AttendanceEntry[] };

export function parseAttendanceSave(raw: unknown): AttendanceSaveInput {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("INVALID_INPUT", 400);
  const ids = parsed.data.entries.map((entry) => entry.rosterId);
  if (new Set(ids).size !== ids.length) throw new DomainError("INVALID_INPUT", 400);
  return {
    ...parsed.data,
    entries: parsed.data.entries.map((entry) => ({
      rosterId: entry.rosterId,
      status: entry.status,
      memo: cleanMemo(entry.memo),
    })),
  };
}

/** Only people who currently belong to the sam may be recorded for it. */
export function assertEntriesBelong(entries: AttendanceEntry[], members: SamMember[]): void {
  const allowed = new Set(members.map((member) => member.id));
  if (entries.some((entry) => !allowed.has(entry.rosterId))) {
    throw new DomainError("MEMBER_NOT_IN_SAM", 400);
  }
}

export type AttendanceCounts = {
  present: number;
  absent: number;
  worshipOnly: number;
  unchecked: number;
  headcount: number;
};

export function countStatuses(headcount: number, statuses: Array<AttendanceStatus | null>): AttendanceCounts {
  const counts: AttendanceCounts = { present: 0, absent: 0, worshipOnly: 0, unchecked: 0, headcount };
  for (const status of statuses) {
    if (status === "present") counts.present += 1;
    else if (status === "absent") counts.absent += 1;
    else if (status === "worship_only") counts.worshipOnly += 1;
  }
  counts.unchecked = Math.max(0, headcount - counts.present - counts.absent - counts.worshipOnly);
  return counts;
}
