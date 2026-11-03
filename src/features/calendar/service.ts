import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/client";
import { calendarEvents } from "../../db/schema";
import { DomainError } from "../../lib/http";
import { monthBounds, type MonthKey } from "./month";
import type { CalendarEvent, CalendarEventInput } from "./types";

const columns = {
  id: calendarEvents.id,
  title: calendarEvents.title,
  description: calendarEvents.description,
  location: calendarEvents.location,
  startDate: calendarEvents.startDate,
  endDate: calendarEvents.endDate,
  startTime: calendarEvents.startTime,
  endTime: calendarEvents.endTime,
};

function trimTime(value: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

export function toCalendarEvent(row: {
  id: string;
  title: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
}): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startDate: row.startDate,
    endDate: row.endDate,
    startTime: trimTime(row.startTime),
    endTime: trimTime(row.endTime),
  };
}

function values(input: CalendarEventInput) {
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: input.startTime,
    endTime: input.endTime,
  };
}

/** Events that overlap the given month. */
export async function listCalendarEventsForMonth(key: MonthKey): Promise<CalendarEvent[]> {
  const { first, last } = monthBounds(key);
  const rows = await getDb()
    .select(columns)
    .from(calendarEvents)
    .where(and(lte(calendarEvents.startDate, last), gte(calendarEvents.endDate, first)))
    .orderBy(asc(calendarEvents.startDate), asc(calendarEvents.startTime));
  return rows.map(toCalendarEvent);
}

/** Events that have not ended yet as of `today` (YYYY-MM-DD). */
export async function listUpcomingCalendarEvents(
  today: string,
  limit = 10,
): Promise<CalendarEvent[]> {
  const rows = await getDb()
    .select(columns)
    .from(calendarEvents)
    .where(gte(calendarEvents.endDate, today))
    .orderBy(asc(calendarEvents.startDate), asc(calendarEvents.startTime))
    .limit(limit);
  return rows.map(toCalendarEvent);
}

export async function listCalendarEventsForAdmin(): Promise<CalendarEvent[]> {
  const rows = await getDb()
    .select(columns)
    .from(calendarEvents)
    .orderBy(desc(calendarEvents.startDate), desc(calendarEvents.startTime))
    .limit(300);
  return rows.map(toCalendarEvent);
}

export async function createCalendarEvent(
  userId: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const [row] = await getDb()
    .insert(calendarEvents)
    .values({ ...values(input), createdBy: userId })
    .returning(columns);
  return toCalendarEvent(row);
}

export async function updateCalendarEvent(
  id: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const [row] = await getDb()
    .update(calendarEvents)
    .set({ ...values(input), updatedAt: new Date() })
    .where(eq(calendarEvents.id, id))
    .returning(columns);
  if (!row) throw new DomainError("EVENT_NOT_FOUND", 404);
  return toCalendarEvent(row);
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const deleted = await getDb()
    .delete(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .returning({ id: calendarEvents.id });
  if (deleted.length === 0) throw new DomainError("EVENT_NOT_FOUND", 404);
}
