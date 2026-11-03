import { redirect } from "next/navigation";
import { CalendarView } from "../../../components/calendar/CalendarView";
import { getCurrentSessionUser } from "../../../src/features/auth/http-session";
import { isRealDate, parseMonthKey } from "../../../src/features/calendar/month";
import {
  listCalendarEventsForMonth,
  listUpcomingCalendarEvents,
} from "../../../src/features/calendar/service";
import { todayInSeoul } from "../../../src/features/challenge/date";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const user = await getCurrentSessionUser();
  if (!user) redirect("/login");

  const today = todayInSeoul();
  const requested = (await searchParams).date;
  const selected =
    typeof requested === "string" && isRealDate(requested) ? requested : today;
  const monthKey = selected.slice(0, 7);
  const key = parseMonthKey(monthKey)!;

  const [events, upcoming] = await Promise.all([
    listCalendarEventsForMonth(key),
    listUpcomingCalendarEvents(today),
  ]);

  return (
    <main className="shell">
      <section className="feature-heading">
        <h2>일정</h2>
        <p>삼덕청년부의 일정을 확인하세요.</p>
      </section>
      <CalendarView
        today={today}
        initialMonth={monthKey}
        initialSelected={selected}
        initialEvents={events}
        upcoming={upcoming}
      />
    </main>
  );
}
