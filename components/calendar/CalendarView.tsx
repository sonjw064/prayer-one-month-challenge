"use client";

import { useEffect, useState } from "react";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  describeEventDates,
  describeEventTime,
  eventsOnDate,
  formatKoreanDate,
  parseMonthKey,
  shiftMonth,
  formatMonthKey,
} from "../../src/features/calendar/month";
import type { CalendarEvent } from "../../src/features/calendar/types";

function EventCard({ event }: { event: CalendarEvent }) {
  return (
    <article className="evcal-event">
      <strong>{event.title}</strong>
      <p className="evcal-event-meta">
        {event.startDate !== event.endDate && <span>{describeEventDates(event)}</span>}
        <span>{describeEventTime(event)}</span>
        {event.location && <span>📍 {event.location}</span>}
      </p>
      {event.description && <p className="evcal-event-description">{event.description}</p>}
    </article>
  );
}

export function CalendarView({
  today,
  initialMonth,
  initialSelected,
  initialEvents,
  upcoming,
}: {
  today: string;
  initialMonth: string;
  initialSelected: string;
  initialEvents: CalendarEvent[];
  upcoming: CalendarEvent[];
}) {
  const [monthKey, setMonthKey] = useState(initialMonth);
  const [selected, setSelected] = useState(initialSelected);
  const [cache, setCache] = useState<Record<string, CalendarEvent[]>>({
    [initialMonth]: initialEvents,
  });
  const [error, setError] = useState("");

  const month = parseMonthKey(monthKey)!;
  const events = cache[monthKey];
  const weeks = buildMonthGrid(month);

  useEffect(() => {
    if (cache[monthKey]) return;
    let cancelled = false;
    fetch(`/api/calendar?month=${monthKey}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.code ?? "CALENDAR_LOAD_FAILED");
        return body as { events?: CalendarEvent[] };
      })
      .then((body) => {
        if (cancelled) return;
        setCache((current) => ({ ...current, [monthKey]: body.events ?? [] }));
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey, cache]);

  function goToMonth(delta: number) {
    const next = formatMonthKey(shiftMonth(month, delta));
    setError("");
    setMonthKey(next);
    setSelected(today.startsWith(next) ? today : `${next}-01`);
  }

  function goToday() {
    setError("");
    setMonthKey(today.slice(0, 7));
    setSelected(today);
  }

  function openDate(date: string) {
    setError("");
    setMonthKey(date.slice(0, 7));
    setSelected(date);
  }

  const selectedEvents = events ? eventsOnDate(events, selected) : [];

  return (
    <div className="evcal">
      <section className="card evcal-card" aria-label="월간 달력">
        <div className="evcal-head">
          <button className="text-button evcal-nav" type="button" onClick={() => goToMonth(-1)} aria-label="이전 달">‹</button>
          <h3 aria-live="polite">{month.year}년 {month.month}월</h3>
          <button className="text-button evcal-nav" type="button" onClick={() => goToMonth(1)} aria-label="다음 달">›</button>
          <button className="text-button evcal-today" type="button" onClick={goToday}>오늘</button>
        </div>

        <div className="evcal-grid" role="grid" aria-label={`${month.year}년 ${month.month}월`}>
          <div className="evcal-row evcal-weekdays" role="row">
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={label} role="columnheader" className={index === 0 ? "is-sunday" : undefined}>{label}</span>
            ))}
          </div>
          {weeks.map((week) => (
            <div className="evcal-row" role="row" key={week[0].date}>
              {week.map((cell, index) => {
                if (!cell.inMonth) {
                  return <span className="evcal-cell is-out" role="gridcell" aria-hidden="true" key={cell.date} />;
                }
                const dayEvents = events ? eventsOnDate(events, cell.date) : [];
                const classes = [
                  "evcal-cell",
                  cell.date === today ? "is-today" : "",
                  cell.date === selected ? "is-selected" : "",
                  index === 0 ? "is-sunday" : "",
                ].filter(Boolean).join(" ");
                return (
                  <button
                    key={cell.date}
                    type="button"
                    role="gridcell"
                    className={classes}
                    aria-pressed={cell.date === selected}
                    aria-label={`${formatKoreanDate(cell.date)}${dayEvents.length ? `, 일정 ${dayEvents.length}개` : ""}`}
                    onClick={() => setSelected(cell.date)}
                  >
                    <span className="evcal-day">{cell.day}</span>
                    <span className="evcal-dots" aria-hidden="true">
                      {dayEvents.slice(0, 3).map((event) => <i key={event.id} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        {!events && !error && <p className="helper-text">일정을 불러오는 중입니다.</p>}
      </section>

      <section className="card evcal-card" aria-label="선택한 날짜의 일정">
        <h3>{formatKoreanDate(selected)}</h3>
        {events && selectedEvents.length === 0 && <p className="helper-text">등록된 일정이 없습니다.</p>}
        {selectedEvents.map((event) => <EventCard key={event.id} event={event} />)}
      </section>

      <section className="card evcal-card" aria-label="다가오는 일정">
        <h3>다가오는 일정</h3>
        {upcoming.length === 0 ? (
          <p className="helper-text">다가오는 일정이 없습니다.</p>
        ) : (
          <ul className="evcal-upcoming">
            {upcoming.map((event) => {
              const date = event.startDate < today ? today : event.startDate;
              return (
                <li key={event.id}>
                  <button type="button" className="evcal-upcoming-row" onClick={() => openDate(date)}>
                    <span className="evcal-upcoming-date">{describeEventDates(event)}</span>
                    <strong>{event.title}</strong>
                    <span className="helper-text">
                      {describeEventTime(event)}{event.location ? ` · ${event.location}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
