"use client";

import { useEffect, useState } from "react";
import {
  describeEventDates,
  describeEventTime,
} from "../../../src/features/calendar/month";
import type { CalendarEvent, PushStatus } from "../../../src/features/calendar/types";

async function fetchEvents(): Promise<CalendarEvent[]> {
  const response = await fetch("/api/admin/calendar", { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code ?? "CALENDAR_LOAD_FAILED");
  return body.events ?? [];
}

type FormValues = {
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  isImportant: boolean;
  notify: boolean;
};

function initialValues(event: CalendarEvent | null, today: string): FormValues {
  return {
    title: event?.title ?? "",
    startDate: event?.startDate ?? today,
    endDate: event && event.endDate !== event.startDate ? event.endDate : "",
    startTime: event?.startTime ?? "",
    endTime: event?.endTime ?? "",
    location: event?.location ?? "",
    description: event?.description ?? "",
    isImportant: event?.isImportant ?? false,
    notify: false,
  };
}

function saveMessage(pushStatus: PushStatus): string {
  if (pushStatus === "sent") return "일정을 저장하고 알림을 보냈습니다.";
  if (pushStatus === "failed") return "일정은 저장했지만 알림을 보내지 못했습니다.";
  return "일정을 저장했습니다.";
}

function errorMessage(code: string): string {
  if (code === "INVALID_INPUT") {
    return "입력 내용을 확인해 주세요. 종료일은 시작일 이후, 종료 시간은 시작 시간 이후여야 하고, 시작 시간이 있어야 종료 시간을 쓸 수 있습니다.";
  }
  if (code === "EVENT_NOT_FOUND") return "일정을 찾을 수 없습니다. 목록을 새로 불러옵니다.";
  return "일정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

function EventEditor({
  event,
  today,
  onSaved,
  onCancel,
}: {
  event: CalendarEvent | null;
  today: string;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() => initialValues(event, today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (busy || !values.title.trim() || !values.startDate) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        event ? "/api/admin/calendar/" + event.id : "/api/admin/calendar",
        {
          method: event ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: values.title,
            startDate: values.startDate,
            endDate: values.endDate || null,
            startTime: values.startTime || null,
            endTime: values.endTime || null,
            location: values.location,
            description: values.description,
            isImportant: values.isImportant,
            notify: values.notify,
          }),
          signal: AbortSignal.timeout(25_000),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.code ?? "SAVE_FAILED");
      onSaved(saveMessage(body.pushStatus ?? "skipped"));
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === "TimeoutError"
          ? "저장 결과를 확인하지 못했습니다. 일정 목록을 확인한 후 다시 시도해 주세요."
          : errorMessage(cause instanceof Error ? cause.message : ""),
      );
      setBusy(false);
    }
  }

  return (
    <section className="card admin-notice-editor">
      <div className="section-heading">
        <div>
          <h2>{event ? "일정 수정" : "새 일정"}</h2>
          <p className="helper-text">성도는 일정 메뉴에서 등록된 일정을 볼 수 있습니다.</p>
        </div>
        {event && (
          <button className="text-button" type="button" disabled={busy} onClick={onCancel}>새 일정 작성</button>
        )}
      </div>

      <div className="admin-form">
        <label>
          제목
          <input value={values.title} onChange={(e) => set("title", e.target.value)} maxLength={100} disabled={busy} placeholder="일정 제목" />
        </label>
        <label>
          시작일
          <input type="date" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={busy} />
        </label>
        <label>
          종료일 (여러 날 일정일 때만)
          <input type="date" value={values.endDate} min={values.startDate} onChange={(e) => set("endDate", e.target.value)} disabled={busy} />
        </label>
        <div className="evcal-time-fields">
          <label>
            시작 시간
            <input type="time" value={values.startTime} onChange={(e) => set("startTime", e.target.value)} disabled={busy} />
          </label>
          <label>
            종료 시간
            <input type="time" value={values.endTime} onChange={(e) => set("endTime", e.target.value)} disabled={busy || !values.startTime} />
          </label>
        </div>
        <p className="helper-text">시작 시간을 비우면 종일 일정으로 표시됩니다.</p>
        <label>
          장소 (선택)
          <input value={values.location} onChange={(e) => set("location", e.target.value)} maxLength={100} disabled={busy} placeholder="예: 본당, 청년부실" />
        </label>
        <label>
          설명 (선택)
          <textarea value={values.description} onChange={(e) => set("description", e.target.value)} rows={5} maxLength={2000} disabled={busy} placeholder="준비물, 안내 사항 등" />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={values.isImportant} onChange={(e) => set("isImportant", e.target.checked)} disabled={busy} />
          중요 일정 (성도 화면에 붉은색으로 표시)
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={values.notify} onChange={(e) => set("notify", e.target.checked)} disabled={busy} />
          저장하면서 성도에게 알림 보내기
        </label>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="admin-editor-actions">
        <button className="primary-button compact-button" type="button" disabled={busy || !values.title.trim() || !values.startDate} onClick={() => void submit()}>
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </section>
  );
}

function EventRow({
  event,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  return (
    <article className="admin-notice-row">
      <div>
        <div className="admin-notice-title-line">
          <strong>{event.title}</strong>
          {event.isImportant && <span className="evcal-badge">중요</span>}
        </div>
        <p className="helper-text">
          {describeEventDates(event)} · {describeEventTime(event)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </div>
      <div className="header-actions">
        <button className="text-button" type="button" onClick={() => onEdit(event)}>수정</button>
        <button className="text-button danger-button" type="button" onClick={() => onDelete(event)}>삭제</button>
      </div>
    </article>
  );
}

export function AdminCalendarManagement({ today }: { today: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    try {
      setEvents(await fetchEvents());
    } catch {
      setError("일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetchEvents()
      .then((rows) => {
        if (!cancelled) {
          setEvents(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(event: CalendarEvent) {
    if (!window.confirm("‘" + event.title + "’ 일정을 삭제할까요?")) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/calendar/" + event.id, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.code ?? "DELETE_FAILED");
      if (selected?.id === event.id) {
        setSelected(null);
        setFormKey((key) => key + 1);
      }
      setMessage("일정을 삭제했습니다.");
    } catch {
      setError("일정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    await refresh();
  }

  const upcoming = events.filter((event) => event.endDate >= today).sort((a, b) =>
    a.startDate === b.startDate
      ? (a.startTime ?? "").localeCompare(b.startTime ?? "")
      : a.startDate.localeCompare(b.startDate),
  );
  const past = events.filter((event) => event.endDate < today);

  return (
    <div className="admin-feature-page">
      <section className="admin-page-heading">
        <p className="eyebrow">공동체 소식</p>
        <h1>일정 관리</h1>
        <p>청년부 일정을 등록하고 성도에게 알림을 보낼 수 있습니다.</p>
      </section>

      {error && <p className="error-text" role="alert">{error}</p>}
      {message && <p className="helper-text" role="status">{message}</p>}
      {loading ? (
        <section className="card empty-state">일정을 불러오는 중입니다.</section>
      ) : (
        <div className="admin-notice-layout">
          <EventEditor
            key={selected?.id ?? "new-" + formKey}
            event={selected}
            today={today}
            onCancel={() => { setSelected(null); setFormKey((key) => key + 1); }}
            onSaved={(text) => {
              setSelected(null);
              setFormKey((key) => key + 1);
              setError("");
              setMessage(text);
              void refresh();
            }}
          />
          <section className="card admin-section">
            <div className="section-heading"><h2>다가오는 일정</h2></div>
            {upcoming.length === 0 ? (
              <p className="helper-text">다가오는 일정이 없습니다.</p>
            ) : (
              <div className="admin-notice-list">
                {upcoming.map((event) => (
                  <EventRow key={event.id} event={event} onEdit={setSelected} onDelete={(e) => void remove(e)} />
                ))}
              </div>
            )}
            {past.length > 0 && (
              <details className="evcal-past">
                <summary>지난 일정 {past.length}개</summary>
                <div className="admin-notice-list">
                  {past.map((event) => (
                    <EventRow key={event.id} event={event} onEdit={setSelected} onDelete={(e) => void remove(e)} />
                  ))}
                </div>
              </details>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
