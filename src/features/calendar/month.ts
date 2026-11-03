import type { CalendarEvent } from "./types";

/** Pure date helpers for the calendar. All dates are YYYY-MM-DD strings. */

export type MonthKey = { year: number; month: number }; // month: 1-12

export type CalendarCell = { date: string; day: number; inMonth: boolean };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const WEEKDAY_LABELS = WEEKDAYS;

export function parseMonthKey(value: string): MonthKey | null {
  const match = MONTH_RE.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function formatMonthKey({ year, month }: MonthKey): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth({ year, month }: MonthKey, delta: number): MonthKey {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function daysInMonth({ year, month }: MonthKey): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthBounds(key: MonthKey): { first: string; last: string } {
  return {
    first: `${formatMonthKey(key)}-01`,
    last: `${formatMonthKey(key)}-${pad(daysInMonth(key))}`,
  };
}

/** Weeks (Sunday first) covering the month; days outside the month are flagged. */
export function buildMonthGrid(key: MonthKey): CalendarCell[][] {
  const firstWeekday = new Date(Date.UTC(key.year, key.month - 1, 1)).getUTCDay();
  const weekCount = Math.ceil((firstWeekday + daysInMonth(key)) / 7);
  const weeks: CalendarCell[][] = [];
  for (let week = 0; week < weekCount; week += 1) {
    const row: CalendarCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(Date.UTC(key.year, key.month - 1, 1 + week * 7 + weekday - firstWeekday));
      row.push({
        date: toKey(date),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === key.month - 1,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

export function eventOccursOn(
  event: Pick<CalendarEvent, "startDate" | "endDate">,
  date: string,
): boolean {
  return event.startDate <= date && date <= event.endDate;
}

/** Events on a date: important first, then all-day, then by start time, then by title. */
export function eventsOnDate(events: CalendarEvent[], date: string): CalendarEvent[] {
  return events
    .filter((event) => eventOccursOn(event, date))
    .sort((a, b) => {
      if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1;
      if (a.startTime === b.startTime) return a.title.localeCompare(b.title, "ko");
      if (a.startTime === null) return -1;
      if (b.startTime === null) return 1;
      return a.startTime.localeCompare(b.startTime);
    });
}

export function weekdayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** "2026-11-09" -> "11월 9일(월)" */
export function formatKoreanDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}월 ${day}일(${weekdayLabel(date)})`;
}

/** "13:05" -> "오후 1:05" */
export function formatKoreanTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const period = hour < 12 ? "오전" : "오후";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${display}:${pad(minute)}`;
}

export function describeEventDates(
  event: Pick<CalendarEvent, "startDate" | "endDate">,
): string {
  return event.startDate === event.endDate
    ? formatKoreanDate(event.startDate)
    : `${formatKoreanDate(event.startDate)} ~ ${formatKoreanDate(event.endDate)}`;
}

export function describeEventTime(
  event: Pick<CalendarEvent, "startTime" | "endTime">,
): string {
  if (!event.startTime) return "종일";
  return event.endTime
    ? `${formatKoreanTime(event.startTime)} ~ ${formatKoreanTime(event.endTime)}`
    : formatKoreanTime(event.startTime);
}

/** Push notification title; important events are prefixed. */
export function pushTitleForEvent(event: Pick<CalendarEvent, "title" | "isImportant">): string {
  return event.isImportant ? `[중요] ${event.title}` : event.title;
}

/** Body text of the push notification for an event. */
export function describeEventForPush(
  event: Pick<CalendarEvent, "startDate" | "endDate" | "startTime" | "endTime" | "location">,
): string {
  const parts = [describeEventDates(event)];
  if (event.startTime) parts.push(describeEventTime(event));
  const when = parts.join(" ");
  return event.location ? `${when} · ${event.location}` : when;
}
