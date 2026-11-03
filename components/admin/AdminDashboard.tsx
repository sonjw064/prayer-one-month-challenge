"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { RosterImportPanel } from "./users/RosterImportPanel";
import type {
  AdminRosterPage,
  AdminRosterRow,
} from "../../src/features/admin/roster-service";
import type { AdminDashboardData } from "../../src/features/admin/service";
import { defaultEndDate } from "../../src/features/challenge/date";

type Modal = "challenge" | "roster" | null;

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

async function jsonRequest(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code ?? "REQUEST_FAILED");
  return body;
}

export function AdminDashboard({
  initial,
  initialRoster,
}: {
  initial: AdminDashboardData;
  initialRoster: AdminRosterPage;
}) {
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState("");
  const [participantQuery, setParticipantQuery] = useState("");
  const [samFilter, setSamFilter] = useState("");
  const [rosterQuery, setRosterQuery] = useState("");
  const [participation, setParticipation] = useState<"all" | "joined" | "not_joined">("all");
  const [rosterRows, setRosterRows] = useState(initialRoster.rows);
  const [nextOffset, setNextOffset] = useState(initialRoster.nextOffset);
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
  const [challengeStart, setChallengeStart] = useState(initial.challenge?.startDate ?? "");
  const [challengeEnd, setChallengeEnd] = useState(initial.challenge?.endDate ?? "");
  const [selectedRosterIds, setSelectedRosterIds] = useState<Set<string>>(new Set());
  const [rosterActionBusy, setRosterActionBusy] = useState(false);

  const filteredMembers = useMemo(() => {
    const needle = participantQuery.trim().toLocaleLowerCase("ko-KR");
    return initial.members.filter((member) => {
      const matchesText =
        !needle ||
        member.name.toLocaleLowerCase("ko-KR").includes(needle) ||
        (member.position ?? "").toLocaleLowerCase("ko-KR").includes(needle);
      const matchesSam = !samFilter || (member.samLabel ?? "미지정") === samFilter;
      return matchesText && matchesSam;
    });
  }, [initial.members, participantQuery, samFilter]);

  const selectedRoster =
    rosterRows.find((row) => row.id === selectedRosterId) ?? null;

  function changeChallengeStart(value: string) {
    setChallengeStart(value);
    setChallengeEnd(value ? defaultEndDate(value) : "");
  }

  async function submitChallenge(formData: FormData) {
    setError("");
    try {
      await jsonRequest("/api/admin/challenge", {
        method: "POST",
        body: JSON.stringify({
          id: initial.challenge?.id,
          title: String(formData.get("title") ?? ""),
          startDate: challengeStart,
          endDate: challengeEnd || undefined,
          isActive: formData.get("isActive") === "on",
        }),
      });
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장하지 못했습니다.");
    }
  }

  async function loadRoster(reset: boolean) {
    setError("");
    const offset = reset ? 0 : nextOffset;
    if (!reset && offset === null) return;

    const params = new URLSearchParams({
      q: rosterQuery,
      participation,
      offset: String(offset ?? 0),
    });
    try {
      const body = await jsonRequest(`/api/admin/roster?${params.toString()}`);
      const page = body as AdminRosterPage;
      setRosterRows((current) => reset ? page.rows : [...current, ...page.rows]);
      if (reset) setSelectedRosterIds(new Set());
      setNextOffset(page.nextOffset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "명단을 불러오지 못했습니다.");
    }
  }

  function searchRoster(event: FormEvent) {
    event.preventDefault();
    void loadRoster(true);
  }

  function openCreateRoster() {
    setSelectedRosterId(null);
    setModal("roster");
  }

  function openEditRoster(row: AdminRosterRow) {
    setSelectedRosterId(row.id);
    setModal("roster");
  }

  const allVisibleRosterSelected =
    rosterRows.length > 0 &&
    rosterRows.every((row) => selectedRosterIds.has(row.id));

  function toggleRosterSelection(id: string, checked: boolean) {
    setSelectedRosterIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisibleRoster(checked: boolean) {
    setSelectedRosterIds(
      checked ? new Set(rosterRows.map((row) => row.id)) : new Set(),
    );
  }

  async function deleteSelectedRoster() {
    const ids = [...selectedRosterIds];
    if (ids.length === 0) return;
    if (!window.confirm(`선택한 ${ids.length}명을 로그인 허용 명단에서 삭제할까요?`)) {
      return;
    }

    setRosterActionBusy(true);
    setError("");
    try {
      await jsonRequest("/api/admin/roster", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === "CANNOT_DELETE_SELF"
          ? "현재 로그인한 관리자 본인은 삭제할 수 없습니다."
          : cause instanceof Error
            ? cause.message
            : "선택 명단을 삭제하지 못했습니다.",
      );
    } finally {
      setRosterActionBusy(false);
    }
  }

  async function resetRosterToInitialPassword() {
    if (!selectedRoster) return;
    if (!window.confirm("비밀번호를 등록된 전화번호로 초기화할까요?")) return;

    setRosterActionBusy(true);
    setError("");
    try {
      await jsonRequest("/api/admin/roster/password", {
        method: "POST",
        body: JSON.stringify({ id: selectedRoster.id, mode: "initial" }),
      });
      window.location.reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "비밀번호를 초기화하지 못했습니다.",
      );
    } finally {
      setRosterActionBusy(false);
    }
  }

  async function submitRoster(formData: FormData) {
    setError("");
    const newPassword = String(formData.get("password") ?? "");
    const payload = {
      name: String(formData.get("name") ?? ""),
      position: String(formData.get("position") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
      village: String(formData.get("village") ?? "") || null,
      sam: String(formData.get("sam") ?? "") || null,
      isActive: formData.get("isActive") === "on",
      isAdmin: formData.get("isAdmin") === "on",
    };

    try {
      const saved = await jsonRequest("/api/admin/roster", {
        method: selectedRoster ? "PATCH" : "POST",
        body: JSON.stringify(
          selectedRoster ? { id: selectedRoster.id, ...payload } : payload,
        ),
      });
      const rosterId = selectedRoster?.id ?? String(saved.id ?? "");
      if (newPassword && rosterId) {
        await jsonRequest("/api/admin/roster/password", {
          method: "POST",
          body: JSON.stringify({
            id: rosterId,
            mode: "custom",
            password: newPassword,
          }),
        });
      }
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "명단을 저장하지 못했습니다.");
    }
  }

  return (
    <>
      <header className="admin-header">
        <div>
          <p className="eyebrow">관리자</p>
          <h1>기도운동 진행 현황</h1>
          <p>
            {initial.challenge
              ? `${initial.challenge.startDate} ~ ${initial.challenge.endDate}`
              : "활성 도전 없음"}
          </p>
        </div>
        <div className="header-actions">
          <Link href="/">사용자 화면</Link>
          <button className="text-button" type="button" onClick={() => setModal("challenge")}>
            도전 설정
          </button>
          <button className="text-button" type="button" onClick={openCreateRoster}>
            명단 추가
          </button>
        </div>
      </header>

      {error && <p className="error-text" role="alert">{error}</p>}

      <section className="admin-kpis" aria-label="전체 현황">
        <article className="card"><span>전체 참여자</span><strong>{initial.totals.members}명</strong></article>
        <article className="card"><span>오늘 완료</span><strong>{initial.totals.todayCompleted}명 · {percent(initial.totals.todayRate)}</strong></article>
        <article className="card"><span>평균 달성률</span><strong>{percent(initial.totals.averageRate)}</strong></article>
      </section>

      <section className="card admin-section">
        <h2>달성률 구간</h2>
        <div className="bucket-grid">
          <div><strong>{initial.buckets.perfect}</strong><span>100%</span></div>
          <div><strong>{initial.buckets.high}</strong><span>80~99%</span></div>
          <div><strong>{initial.buckets.medium}</strong><span>60~79%</span></div>
          <div><strong>{initial.buckets.low}</strong><span>60% 미만</span></div>
        </div>
      </section>

      <section className="card admin-section">
        <h2>샘별 통계</h2>
        <div className="admin-table">
          <div className="admin-row admin-row-head">
            <span>샘</span><span>인원</span><span>평균</span><span>오늘</span>
          </div>
          {initial.sams.map((sam) => (
            <div className="admin-row" key={sam.samLabel}>
              <span><strong>{sam.samLabel}</strong></span>
              <span>{sam.members}명</span>
              <span>{percent(sam.averageRate)}</span>
              <span>{sam.todayCompleted}명 · {percent(sam.todayRate)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <h2>참여자 명단</h2>
          <div className="admin-filters">
            <input
              value={participantQuery}
              onChange={(event) => setParticipantQuery(event.target.value)}
              placeholder="이름 또는 직분 검색"
              aria-label="참여자 검색"
            />
            <select value={samFilter} onChange={(event) => setSamFilter(event.target.value)} aria-label="샘 필터">
              <option value="">전체 샘</option>
              {initial.sams.map((sam) => (
                <option key={sam.samLabel} value={sam.samLabel}>{sam.samLabel}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="admin-table participant-table">
          <div className="admin-row admin-row-head participant-row">
            <span>이름</span><span>직분</span><span>전화번호</span><span>샘</span>
            <span>순위</span><span>달성률</span><span>오늘</span>
          </div>
          {filteredMembers.map((member) => (
            <div className="admin-row participant-row" key={member.userId}>
              <span><strong>{member.name}</strong>{member.role === "admin" && <small>관리자</small>}</span>
              <span>{member.position ?? "미지정"}</span>
              <span>{member.phone ?? "미지정"}</span>
              <span>{member.samLabel ?? "미지정"}</span>
              <span>{member.rank}위</span>
              <span>{member.completed}/{member.eligible} · {percent(member.rate)}</span>
              <span>{member.completedToday ? "완료" : "미완료"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card admin-section">
        <div className="section-heading">
          <h2>전체 로그인 허용 명단</h2>
          <div className="header-actions">
            <button
              className="text-button danger-button"
              type="button"
              disabled={selectedRosterIds.size === 0 || rosterActionBusy}
              onClick={() => void deleteSelectedRoster()}
            >
              삭제{selectedRosterIds.size > 0 ? ` (${selectedRosterIds.size})` : ""}
            </button>
            <button className="primary-button compact-button" type="button" onClick={openCreateRoster}>
              사용자 추가
            </button>
          </div>
        </div>

        <RosterImportPanel
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          ariaLabel="삼덕청년부 XLS 파일"
          helper="엑셀(.xls, .xlsx)로 명단을 가져옵니다. 새 사람을 추가하고 기존 사람의 직분·마을·샘을 채울 뿐, 삭제하지 않으며 기존 참여자의 기도기록은 유지됩니다. 먼저 미리보기로 확인할 수 있습니다."
          onImported={() => loadRoster(true)}
        />

        <form className="admin-filters roster-filters" onSubmit={searchRoster}>
          <input
            value={rosterQuery}
            onChange={(event) => setRosterQuery(event.target.value)}
            placeholder="이름, 전화번호 또는 샘"
            aria-label="허용 명단 검색"
          />
          <select value={participation} onChange={(event) => setParticipation(event.target.value as typeof participation)}>
            <option value="all">전체</option>
            <option value="joined">활성</option>
            <option value="not_joined">비활성</option>
          </select>
          <button className="text-button" type="submit">검색</button>
        </form>

        <div className="admin-table roster-table">
          <div className="admin-row admin-row-head roster-row">
            <span className="roster-select-cell">
              <input
                type="checkbox"
                checked={allVisibleRosterSelected}
                onChange={(event) => toggleAllVisibleRoster(event.target.checked)}
                aria-label="현재 표시 명단 전체 선택"
              />
            </span>
            <span>이름</span><span>직분</span><span>전화번호</span><span>샘</span>
            <span>비밀번호</span><span>상태</span><span>관리</span>
          </div>
          {rosterRows.map((row) => (
            <div className="admin-row roster-row" key={row.id}>
              <span className="roster-select-cell">
                <input
                  type="checkbox"
                  checked={selectedRosterIds.has(row.id)}
                  onChange={(event) =>
                    toggleRosterSelection(row.id, event.target.checked)
                  }
                  aria-label={`${row.name} 선택`}
                />
              </span>
              <span><strong>{row.name}</strong>{row.isAdmin && <small>관리자</small>}</span>
              <span>{row.position ?? "미지정"}</span>
              <span>{row.phone ?? "미등록"}</span>
              <span>{row.samLabel ?? "미지정"}</span>
              <span>
                {row.passwordMode === "initial"
                  ? "초기(전화번호)"
                  : "변경됨"}
              </span>
              <span>{row.joined ? "활성" : "비활성"}{row.isActive ? "" : " · 로그인 제한"}</span>
              <span>
                <button className="text-button" type="button" onClick={() => openEditRoster(row)}>
                  수정
                </button>
              </span>
            </div>
          ))}
        </div>

        {nextOffset !== null && (
          <button className="text-button load-more-button" type="button" onClick={() => void loadRoster(false)}>
            더 보기
          </button>
        )}
      </section>

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="관리 설정" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setModal(null)} aria-label="닫기">×</button>

            {modal === "challenge" && (
              <form action={submitChallenge} className="admin-form">
                <h2>도전 설정</h2>
                <label>제목<input name="title" defaultValue={initial.challenge?.title ?? "기도운동 1달 도전"} required /></label>
                <label>시작일<input name="startDate" type="date" value={challengeStart} onChange={(event) => changeChallengeStart(event.target.value)} required /></label>
                <label>종료일<input name="endDate" type="date" value={challengeEnd} onChange={(event) => setChallengeEnd(event.target.value)} required /></label>
                <p className="helper-text">시작일을 바꾸면 1개월 기준 종료일이 자동 계산되며, 필요하면 종료일을 직접 수정할 수 있습니다.</p>
                <label className="checkbox-row"><input name="isActive" type="checkbox" defaultChecked={initial.challenge?.isActive ?? true} /> 활성화</label>
                <button className="primary-button" type="submit">저장</button>
              </form>
            )}

            {modal === "roster" && (
              <form action={submitRoster} className="admin-form" key={selectedRoster?.id ?? "new"}>
                <h2>{selectedRoster ? "명단 수정" : "사용자 추가"}</h2>
                <label>이름<input name="name" defaultValue={selectedRoster?.name ?? ""} required /></label>
                <label>직분<input name="position" defaultValue={selectedRoster?.position ?? ""} /></label>
                <label>전화번호<input name="phone" type="tel" defaultValue={selectedRoster?.phone ?? ""} /></label>
                <label>마을<input name="village" defaultValue={selectedRoster?.village ?? ""} placeholder="예: 1마을" /></label>
                <label>샘<input name="sam" defaultValue={selectedRoster?.sam ?? ""} placeholder="예: 6샘" /></label>
                {selectedRoster && (
                  <div className="password-status-box">
                    <strong>현재 비밀번호</strong>
                    <span>
                      {selectedRoster.passwordMode === "initial"
                        ? selectedRoster.phone
                          ? `초기값: ${selectedRoster.phone}`
                          : "초기 비밀번호 사용 중 · 전화번호 미등록"
                        : "변경됨 · 원문은 보안상 저장하지 않습니다."}
                    </span>
                    <button
                      className="text-button"
                      type="button"
                      disabled={rosterActionBusy}
                      onClick={() => void resetRosterToInitialPassword()}
                    >
                      전화번호로 초기화
                    </button>
                  </div>
                )}
                <label>
                  새 비밀번호
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder={selectedRoster ? "변경할 때만 입력" : "필요하면 입력"}
                  />
                </label>
                <label className="checkbox-row"><input name="isActive" type="checkbox" defaultChecked={selectedRoster?.isActive ?? true} /> 로그인 허용</label>
                <label className="checkbox-row"><input name="isAdmin" type="checkbox" defaultChecked={selectedRoster?.isAdmin ?? false} /> 관리자</label>
                <button className="primary-button" type="submit">저장</button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
