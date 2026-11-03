"use client";

import { useEffect, useState } from "react";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  MAX_MEMO_LENGTH,
  type AttendanceStatus,
  type AttendanceView,
} from "../../src/features/attendance/labels";

type Mark = { status: AttendanceStatus | null; memo: string };
type Marks = Record<string, Mark>;
type Query = { samId: string | null; date: string | null };

function normalizeMemo(memo: string): string {
  return memo.replace(/\s+/gu, " ").trim();
}

function toMarks(view: AttendanceView): Marks {
  return Object.fromEntries(view.members.map((member) => [member.id, { status: member.status, memo: member.memo }]));
}

/** A note only counts for people who are checked. */
function sameMarks(a: Marks, b: Marks): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key] ?? { status: null, memo: "" };
    const right = b[key] ?? { status: null, memo: "" };
    if (left.status !== right.status) return false;
    if (left.status && normalizeMemo(left.memo) !== normalizeMemo(right.memo)) return false;
  }
  return true;
}

function loadError(status: number, code: string | undefined): string {
  if (status === 403 && !code) return "샘 리더와 마을장만 사용할 수 있습니다.";
  if (code === "FORBIDDEN") return "샘 리더와 마을장만 사용할 수 있습니다.";
  if (code === "DATE_NOT_ALLOWED") return "이 날짜는 선택할 수 없습니다. 오늘부터 최근 8주 안의 날짜를 선택해 주세요.";
  if (code === "INVALID_DATE") return "날짜를 확인해 주세요.";
  return "출석 명단을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function saveError(code: string | undefined): string {
  if (code === "DATE_NOT_ALLOWED") return "이 날짜는 저장할 수 없습니다. 오늘부터 최근 8주 안의 날짜만 입력할 수 있습니다.";
  if (code === "MEMBER_NOT_IN_SAM") return "명단이 바뀌었습니다. 새로고침한 뒤 다시 체크해 주세요.";
  if (code === "FORBIDDEN") return "이 샘의 출석을 저장할 권한이 없습니다.";
  return "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function AttendanceBoard() {
  const [query, setQuery] = useState<Query>({ samId: null, date: null });
  const [view, setView] = useState<AttendanceView | null>(null);
  const [marks, setMarks] = useState<Marks>({});
  const [saved, setSaved] = useState<Marks>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (query.samId) params.set("samId", query.samId);
    if (query.date) params.set("date", query.date);
    fetch(`/api/attendance?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(loadError(response.status, body.code));
        return body as AttendanceView;
      })
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setMarks(toMarks(next));
        setSaved(toMarks(next));
        setError("");
        setLoading(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : loadError(0, undefined));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const dirty = !sameMarks(marks, saved);
  const members = view?.members ?? [];
  const counts = { present: 0, absent: 0, worship_only: 0 };
  for (const member of members) {
    const status = marks[member.id]?.status;
    if (status) counts[status] += 1;
  }
  const unchecked = members.length - counts.present - counts.absent - counts.worship_only;

  function move(next: Query) {
    if (dirty && !window.confirm("저장하지 않은 체크가 있습니다. 저장하지 않고 이동할까요?")) return;
    setLoading(true);
    setMessage("");
    setError("");
    setQuery(next);
  }

  function setStatus(id: string, status: AttendanceStatus | null) {
    setMessage("");
    // Unchecking someone also drops their note: notes belong to a check.
    setMarks((current) => ({ ...current, [id]: { status, memo: status ? current[id]?.memo ?? "" : "" } }));
  }

  function setMemo(id: string, memo: string) {
    setMessage("");
    setMarks((current) => ({ ...current, [id]: { status: current[id]?.status ?? null, memo } }));
  }

  function allPresent() {
    setMessage("");
    setMarks(Object.fromEntries(members.map((member) => [member.id, { status: "present" as const, memo: marks[member.id]?.memo ?? "" }])));
  }

  async function save() {
    if (!view?.sam || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          samId: view.sam.id,
          date: view.date,
          entries: members.flatMap((member) => {
            const mark = marks[member.id];
            return mark?.status ? [{ rosterId: member.id, status: mark.status, memo: normalizeMemo(mark.memo) }] : [];
          }),
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(saveError(body.code));
      const normalized = Object.fromEntries(
        Object.entries(marks).map(([id, mark]) => [id, { status: mark.status, memo: mark.status ? normalizeMemo(mark.memo) : "" }]),
      );
      setMarks(normalized);
      setSaved(normalized);
      const result = body.result as { saved: boolean; unchecked: number };
      setMessage(
        !result.saved
          ? "체크를 모두 해제하여 이 날짜의 기록을 지웠습니다."
          : result.unchecked > 0
            ? `저장했습니다. 아직 체크하지 않은 사람이 ${result.unchecked}명 있습니다.`
            : "저장했습니다. 모든 인원을 체크했습니다.",
      );
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "TimeoutError"
        ? "저장 결과를 확인하지 못했습니다. 화면을 새로고침해 저장 여부를 확인해 주세요."
        : cause instanceof Error ? cause.message : saveError(undefined));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !view) return <section className="card empty-state">출석 명단을 불러오는 중입니다.</section>;
  if (!view) return <section className="card"><p className="error-text" role="alert">{error}</p></section>;
  if (view.sams.length === 0) {
    return <section className="card empty-state">담당하는 샘이 없습니다. 샘 리더나 마을장으로 등록된 사람만 사용할 수 있습니다.</section>;
  }

  return (
    <div className="att">
      <section className="card att-controls" aria-label="샘과 날짜 선택">
        {view.sams.length > 1 && (
          <label>
            샘
            <select
              value={view.sam?.id ?? ""}
              disabled={loading || saving}
              onChange={(event) => move({ samId: event.target.value, date: view.date })}
            >
              {view.sams.map((sam) => (
                <option key={sam.id} value={sam.id}>{sam.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          날짜
          <input
            type="date"
            value={view.date}
            min={view.range.min}
            max={view.range.max}
            disabled={loading || saving}
            onChange={(event) => event.target.value && move({ samId: view.sam?.id ?? null, date: event.target.value })}
          />
        </label>
        <button
          className="text-button"
          type="button"
          disabled={loading || saving || view.date === view.range.max}
          onClick={() => move({ samId: view.sam?.id ?? null, date: view.range.max })}
        >
          오늘로
        </button>
      </section>

      {error && <p className="error-text" role="alert">{error}</p>}

      <section className="card att-card" aria-label={`${view.sam?.name ?? ""} 출석 체크`} aria-busy={loading}>
        <div className="att-head">
          <h3>{view.sam?.name} · {members.length}명</h3>
          <button className="text-button" type="button" disabled={loading || saving || members.length === 0} onClick={allPresent}>
            전원 출석
          </button>
        </div>
        <p className="att-summary" aria-live="polite">
          출석 {counts.present} · 불참 {counts.absent} · 예배 {counts.worship_only} · 미체크 {unchecked}
        </p>
        <p className="helper-text">
          출석은 샘 모임 참석, 예배는 샘 모임은 빠졌지만 예배에 참석한 경우입니다. 같은 버튼을 다시 누르면 체크가 해제됩니다.
          체크한 사람에게는 메모를 남길 수 있고, 꼭 쓰지 않아도 됩니다. 민감한 개인 사정은 꼭 필요한 내용만 적어 주세요.
        </p>

        {members.length === 0 ? (
          <p className="helper-text">이 샘에 속한 인원이 없습니다. 명단의 샘 정보를 확인해 주세요.</p>
        ) : (
          <ul className="att-list">
            {members.map((member) => {
              const current = marks[member.id]?.status ?? null;
              return (
                <li className="att-row" key={member.id}>
                  <span className="att-name">{member.name}</span>
                  <div className="att-choices" role="group" aria-label={`${member.name} 출석 체크`}>
                    {ATTENDANCE_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`att-choice is-${status}${current === status ? " is-on" : ""}`}
                        aria-pressed={current === status}
                        disabled={loading || saving}
                        onClick={() => setStatus(member.id, current === status ? null : status)}
                      >
                        {ATTENDANCE_LABELS[status]}
                      </button>
                    ))}
                  </div>
                  {current && (
                    <input
                      className="att-memo"
                      aria-label={`${member.name} 메모`}
                      placeholder="메모 (선택)"
                      maxLength={MAX_MEMO_LENGTH}
                      value={marks[member.id]?.memo ?? ""}
                      disabled={loading || saving}
                      onChange={(event) => setMemo(member.id, event.target.value)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="att-actions">
          <button className="primary-button" type="button" disabled={loading || saving || !dirty} onClick={() => void save()}>
            {saving ? "저장 중…" : "저장"}
          </button>
          {dirty && <span className="helper-text">저장하지 않은 변경이 있습니다.</span>}
          {!dirty && view.savedAt && !message && (
            <span className="helper-text">
              마지막 저장 {new Date(view.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
        {message && <p className="success-text" role="status">{message}</p>}
      </section>
    </div>
  );
}
