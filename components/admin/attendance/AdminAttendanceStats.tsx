"use client";

import { useEffect, useState } from "react";
import {
  formatRate,
  type AttendanceStats,
  type GroupTotals,
  type Totals,
} from "../../../src/features/attendance/stats-types";

type Filter = { from: string; to: string; village: string; samId: string };

function lastDayOfMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, mon, 0)).getUTCDate()).padStart(2, "0")}`;
}

function toQuery(filter: Filter): string {
  const params = new URLSearchParams({ from: filter.from, to: filter.to });
  if (filter.village) params.set("village", filter.village);
  if (filter.samId) params.set("samId", filter.samId);
  return params.toString();
}

function weekLabel(monday: string): string {
  const [, month, day] = monday.split("-").map(Number);
  return `${month}/${day}`;
}

function errorText(code: string | undefined): string {
  if (code === "INVALID_RANGE") return "기간을 확인해 주세요. 시작일은 종료일보다 늦을 수 없습니다.";
  if (code === "RANGE_TOO_LONG") return "기간은 최대 1년까지 선택할 수 있습니다.";
  return "통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function TotalsCells({ totals }: { totals: Totals }) {
  return (
    <>
      <td>{totals.sessions}</td>
      <td>{totals.headcount}</td>
      <td>{totals.present}</td>
      <td>{totals.absent}</td>
      <td>{totals.worshipOnly}</td>
      <td>{totals.unchecked}</td>
      <td><strong>{formatRate(totals.presentRate)}</strong></td>
      <td>{formatRate(totals.presentRateOfChecked)}</td>
      <td>{formatRate(totals.attendRate)}</td>
    </>
  );
}

const TOTAL_HEADS = ["모임", "전체 인원", "출석", "불참", "예배", "미체크", "출석률 (전체 인원)", "출석률 (체크 인원)", "예배 포함 (전체 인원)"];

function GroupTable({ title, label, groups }: { title: string; label: string; groups: GroupTotals[] }) {
  return (
    <section className="card admin-section" aria-label={title}>
      <h2>{title}</h2>
      {groups.length === 0 ? (
        <p className="helper-text">이 기간에 저장된 출석 기록이 없습니다.</p>
      ) : (
        <div className="att-scroll">
          <table className="att-table">
            <thead><tr><th scope="col">{label}</th>{TOTAL_HEADS.map((head) => <th key={head} scope="col">{head}</th>)}</tr></thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.key}><th scope="row">{group.name}</th><TotalsCells totals={group.totals} /></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AdminAttendanceStats({ today }: { today: string }) {
  const [filter, setFilter] = useState<Filter>({ from: `${today.slice(0, 7)}-01`, to: today, village: "", samId: "" });
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/attendance/stats?${toQuery(filter)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorText(body.code));
        return body as AttendanceStats;
      })
      .then((next) => {
        if (cancelled) return;
        setStats(next);
        setError("");
        setLoading(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : errorText(undefined));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  function change(next: Partial<Filter>) {
    setLoading(true);
    setFilter((current) => ({ ...current, ...next }));
  }

  function pickMonth(month: string) {
    if (!month) return;
    const last = lastDayOfMonth(month);
    change({ from: `${month}-01`, to: last > today ? today : last });
  }

  async function download() {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/attendance/export?${toQuery(filter)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("EXPORT_FAILED");
      const blob = await response.blob();
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get("content-disposition") ?? "")?.[1];
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = encoded ? decodeURIComponent(encoded) : "샘출석.xlsx";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("엑셀을 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  }

  const samOptions = (stats?.filters.sams ?? []).filter((sam) => !filter.village || sam.village === filter.village);
  const maxMonthRate = 1;

  return (
    <div className="admin-feature-page">
      <section className="admin-page-heading">
        <p className="eyebrow">샘 모임</p>
        <h1>샘원 관리</h1>
        <p>샘 리더와 마을장이 입력한 출석을 집계합니다. 기록이 없는 날은 통계에 포함되지 않습니다.</p>
      </section>

      <section className="card admin-section att-filters" aria-label="조회 조건">
        <label>월 선택<input type="month" value={filter.from.slice(0, 7)} max={today.slice(0, 7)} onChange={(e) => pickMonth(e.target.value)} /></label>
        <label>시작일<input type="date" value={filter.from} max={filter.to} onChange={(e) => e.target.value && change({ from: e.target.value })} /></label>
        <label>종료일<input type="date" value={filter.to} min={filter.from} onChange={(e) => e.target.value && change({ to: e.target.value })} /></label>
        <label>
          마을
          <select value={filter.village} onChange={(e) => change({ village: e.target.value, samId: "" })}>
            <option value="">전체</option>
            {(stats?.filters.villages ?? []).map((village) => <option key={village} value={village}>{village}마을</option>)}
          </select>
        </label>
        <label>
          샘
          <select value={filter.samId} onChange={(e) => change({ samId: e.target.value })}>
            <option value="">전체</option>
            {samOptions.map((sam) => <option key={sam.id} value={sam.id}>{sam.name}</option>)}
          </select>
        </label>
        <button className="text-button" type="button" disabled={exporting} onClick={() => void download()}>
          {exporting ? "엑셀 만드는 중..." : "엑셀로 내려받기"}
        </button>
      </section>
      <p className="helper-text">엑셀에는 이름과 메모가 들어 있습니다. 개인정보이므로 안전하게 보관하세요.</p>

      {error && <p className="error-text" role="alert">{error}</p>}
      {loading && !stats ? (
        <section className="card empty-state">통계를 불러오는 중입니다.</section>
      ) : stats && (
        <div className="att-stats" aria-busy={loading}>
          <section className="card admin-section" aria-label="전체 요약">
            <h2>전체 요약 · {stats.range.from} ~ {stats.range.to}</h2>
            {stats.totals.sessions === 0 ? (
              <p className="helper-text">이 기간에 저장된 출석 기록이 없습니다.</p>
            ) : (
              <>
                <div className="att-cards">
                  <div><span>출석률 (전체 인원 기준)</span><strong>{formatRate(stats.totals.presentRate)}</strong></div>
                  <div><span>출석률 (체크한 인원 기준)</span><strong>{formatRate(stats.totals.presentRateOfChecked)}</strong></div>
                  <div><span>예배 포함 참석률 (전체 인원 기준)</span><strong>{formatRate(stats.totals.attendRate)}</strong></div>
                </div>
                <dl className="att-counts">
                  <div><dt>모임 횟수</dt><dd>{stats.totals.sessions}</dd></div>
                  <div><dt>전체 인원(연인원)</dt><dd>{stats.totals.headcount}</dd></div>
                  <div><dt>출석</dt><dd>{stats.totals.present}</dd></div>
                  <div><dt>불참</dt><dd>{stats.totals.absent}</dd></div>
                  <div><dt>예배</dt><dd>{stats.totals.worshipOnly}</dd></div>
                  <div><dt>미체크</dt><dd>{stats.totals.unchecked}</dd></div>
                </dl>
                <p className="helper-text">전체 인원은 출석을 저장한 시점의 샘 인원 수를 모임마다 더한 값입니다.</p>
              </>
            )}
          </section>

          {stats.people.alerts.length > 0 && (
            <section className="card admin-section att-alerts" aria-label="연속 불참 주의">
              <h2>연속 불참 주의 ({stats.people.threshold}회 이상)</h2>
              <ul>
                {stats.people.alerts.map((person) => (
                  <li key={person.rosterId}>
                    <strong>{person.name}</strong> <span className="helper-text">{person.samLabel ?? "샘 없음"}</span>
                    <span className="status-pill">{person.streak}회 연속 불참</span>
                    <span className="helper-text">마지막 기록 {person.lastDate}{person.lastMemo ? ` · ${person.lastMemo}` : ""}</span>
                  </li>
                ))}
              </ul>
              <p className="helper-text">체크하지 않은 주는 건너뛰고, 기록된 출석 중 최근부터 연속으로 불참한 횟수입니다.</p>
            </section>
          )}

          <section className="card admin-section" aria-label="월별 현황">
            <h2>월별 현황 (최근 12개월)</h2>
            {stats.monthly.length === 0 ? (
              <p className="helper-text">저장된 출석 기록이 없습니다.</p>
            ) : (
              <div className="att-scroll">
                <table className="att-table">
                  <thead><tr><th scope="col">월</th>{TOTAL_HEADS.map((head) => <th key={head} scope="col">{head}</th>)}<th scope="col">추이</th></tr></thead>
                  <tbody>
                    {stats.monthly.map((month) => (
                      <tr key={month.month}>
                        <th scope="row">{month.month}</th>
                        <TotalsCells totals={month.totals} />
                        <td>
                          <span className="att-bar" aria-hidden="true">
                            <i style={{ width: `${Math.round(Math.min(maxMonthRate, month.totals.presentRate ?? 0) * 100)}%` }} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <GroupTable title="마을별 현황" label="마을" groups={stats.villages} />
          <GroupTable title="샘별 현황" label="샘" groups={stats.sams} />

          <section className="card admin-section" aria-label="제출 현황">
            <h2>제출 현황 (주별 기록 여부)</h2>
            {stats.submission.rows.length === 0 || stats.submission.weeks.length === 0 ? (
              <p className="helper-text">표시할 샘이 없습니다.</p>
            ) : (
              <div className="att-scroll">
                <table className="att-table att-grid">
                  <thead>
                    <tr>
                      <th scope="col">샘</th>
                      {stats.submission.weeks.map((week) => <th key={week} scope="col" title={`${week}부터 한 주`}>{weekLabel(week)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.submission.rows.map((row) => {
                      const missingLast = row.weeks.length > 0 && !row.weeks[row.weeks.length - 1];
                      return (
                        <tr key={row.samId} className={missingLast ? "is-missing" : undefined}>
                          <th scope="row">{row.name}{missingLast && <span className="status-pill">최근 주 미기록</span>}</th>
                          {row.weeks.map((done, index) => (
                            <td key={stats.submission.weeks[index]} aria-label={done ? "기록함" : "기록 없음"}>{done ? "✓" : "–"}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="helper-text">한 주는 월요일부터 일요일까지이고, 그 주에 저장된 출석이 있으면 ✓로 표시합니다. 열의 날짜는 그 주의 월요일입니다.</p>
          </section>

          <section className="card admin-section" aria-label="개인별 현황">
            <h2>개인별 현황</h2>
            {stats.people.rows.length === 0 ? (
              <p className="helper-text">이 기간에 체크된 사람이 없습니다.</p>
            ) : (
              <div className="att-scroll">
                <table className="att-table">
                  <thead><tr>{["이름", "샘", "출석", "불참", "예배", "체크 횟수", "연속 불참", "최근 메모"].map((head) => <th key={head} scope="col">{head}</th>)}</tr></thead>
                  <tbody>
                    {stats.people.rows.map((person) => (
                      <tr key={person.rosterId} className={person.alert ? "is-missing" : undefined}>
                        <th scope="row">{person.name}</th>
                        <td>{person.samLabel ?? ""}</td>
                        <td>{person.present}</td>
                        <td>{person.absent}</td>
                        <td>{person.worshipOnly}</td>
                        <td>{person.checked}</td>
                        <td>{person.streak > 0 ? `${person.streak}회` : "-"}</td>
                        <td className="att-memo-cell">{person.lastMemo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
