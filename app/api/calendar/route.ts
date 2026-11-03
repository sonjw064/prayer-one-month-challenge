import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "../../../src/features/auth/http-session";
import { todayInSeoul } from "../../../src/features/challenge/date";
import {
  formatMonthKey,
  parseMonthKey,
} from "../../../src/features/calendar/month";
import {
  listCalendarEventsForMonth,
  listUpcomingCalendarEvents,
} from "../../../src/features/calendar/service";

export async function GET(request: Request) {
  const user = await getCurrentSessionUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }

  const today = todayInSeoul();
  const param = new URL(request.url).searchParams.get("month");
  const key = parseMonthKey(param ?? today.slice(0, 7));
  if (!key) {
    return NextResponse.json({ code: "INVALID_MONTH" }, { status: 400 });
  }

  const [events, upcoming] = await Promise.all([
    listCalendarEventsForMonth(key),
    listUpcomingCalendarEvents(today),
  ]);
  return NextResponse.json({ month: formatMonthKey(key), events, upcoming });
}
