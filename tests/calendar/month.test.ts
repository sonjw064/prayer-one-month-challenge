import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  describeEventDates,
  describeEventForPush,
  describeEventTime,
  eventsOnDate,
  pushTitleForEvent,
  formatKoreanTime,
  formatMonthKey,
  isRealDate,
  monthBounds,
  parseMonthKey,
  shiftMonth,
  weekdayLabel,
} from "../../src/features/calendar/month";
import type { CalendarEvent } from "../../src/features/calendar/types";

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "e1",
    title: "일정",
    description: "",
    location: "",
    startDate: "2026-11-09",
    endDate: "2026-11-09",
    startTime: null,
    endTime: null,
    isImportant: false,
    ...overrides,
  };
}

describe("calendar month helpers", () => {
  it("parses and formats month keys", () => {
    expect(parseMonthKey("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("2026-1")).toBeNull();
    expect(parseMonthKey("abc")).toBeNull();
    expect(formatMonthKey({ year: 2026, month: 3 })).toBe("2026-03");
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 5 }, 0)).toEqual({ year: 2026, month: 5 });
  });

  it("validates real calendar dates", () => {
    expect(isRealDate("2026-02-28")).toBe(true);
    expect(isRealDate("2026-02-29")).toBe(false);
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2026-13-01")).toBe(false);
    expect(isRealDate("20261101")).toBe(false);
  });

  it("returns first and last day of a month", () => {
    expect(monthBounds({ year: 2026, month: 2 })).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthBounds({ year: 2028, month: 2 })).toEqual({ first: "2028-02-01", last: "2028-02-29" });
  });

  it("builds Sunday-first weeks that cover the month exactly", () => {
    // November 2026 starts on Sunday and has 30 days -> 5 weeks.
    const weeks = buildMonthGrid({ year: 2026, month: 11 });
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({ date: "2026-11-01", day: 1, inMonth: true });
    expect(weeks[4][1]).toEqual({ date: "2026-11-30", day: 30, inMonth: true });
    expect(weeks[4][2].inMonth).toBe(false);

    const inMonth = weeks.flat().filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(30);
  });

  it("pads leading days from the previous month", () => {
    // October 2026 starts on Thursday.
    const weeks = buildMonthGrid({ year: 2026, month: 10 });
    expect(weeks[0].slice(0, 4).map((cell) => cell.inMonth)).toEqual([false, false, false, false]);
    expect(weeks[0][4]).toEqual({ date: "2026-10-01", day: 1, inMonth: true });
  });

  it("matches multi-day events on every covered date", () => {
    const multi = event({ id: "m", startDate: "2026-11-09", endDate: "2026-11-11" });
    expect(eventsOnDate([multi], "2026-11-08")).toHaveLength(0);
    expect(eventsOnDate([multi], "2026-11-09")).toHaveLength(1);
    expect(eventsOnDate([multi], "2026-11-10")).toHaveLength(1);
    expect(eventsOnDate([multi], "2026-11-11")).toHaveLength(1);
    expect(eventsOnDate([multi], "2026-11-12")).toHaveLength(0);
  });

  it("orders a day's events all-day first, then by start time", () => {
    const events = [
      event({ id: "late", title: "저녁", startTime: "19:00" }),
      event({ id: "all", title: "종일" }),
      event({ id: "early", title: "아침", startTime: "07:30" }),
    ];
    expect(eventsOnDate(events, "2026-11-09").map((e) => e.id)).toEqual(["all", "early", "late"]);
  });

  it("puts important events first, then all-day, then by start time", () => {
    const events = [
      event({ id: "late", title: "저녁", startTime: "19:00" }),
      event({ id: "all", title: "종일" }),
      event({ id: "imp-late", title: "중요 저녁", startTime: "20:00", isImportant: true }),
      event({ id: "imp-early", title: "중요 아침", startTime: "07:00", isImportant: true }),
    ];
    expect(eventsOnDate(events, "2026-11-09").map((e) => e.id)).toEqual([
      "imp-early",
      "imp-late",
      "all",
      "late",
    ]);
  });

  it("prefixes important events in the push title", () => {
    expect(pushTitleForEvent(event({ title: "수련회" }))).toBe("수련회");
    expect(pushTitleForEvent(event({ title: "수련회", isImportant: true }))).toBe("[중요] 수련회");
  });

  it("formats Korean dates and times", () => {
    expect(weekdayLabel("2026-11-09")).toBe("월");
    expect(formatKoreanTime("00:00")).toBe("오전 12:00");
    expect(formatKoreanTime("09:05")).toBe("오전 9:05");
    expect(formatKoreanTime("12:00")).toBe("오후 12:00");
    expect(formatKoreanTime("13:30")).toBe("오후 1:30");
    expect(describeEventDates(event({}))).toBe("11월 9일(월)");
    expect(describeEventDates(event({ endDate: "2026-11-11" }))).toBe("11월 9일(월) ~ 11월 11일(수)");
    expect(describeEventTime(event({}))).toBe("종일");
    expect(describeEventTime(event({ startTime: "19:00" }))).toBe("오후 7:00");
    expect(describeEventTime(event({ startTime: "19:00", endTime: "21:00" }))).toBe("오후 7:00 ~ 오후 9:00");
  });

  it("builds the push body with time and location", () => {
    expect(describeEventForPush(event({}))).toBe("11월 9일(월)");
    expect(describeEventForPush(event({ startTime: "19:00", location: "본당" }))).toBe(
      "11월 9일(월) 오후 7:00 · 본당",
    );
  });
});
