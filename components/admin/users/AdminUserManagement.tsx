"use client";

import { FormEvent, useState } from "react";
import type {
  AdminRosterPage,
  AdminRosterRow,
} from "../../../src/features/admin/roster-service";

async function jsonRequest(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code ?? "REQUEST_FAILED");
  return body;
}

export function AdminUserManagement({ initial }: { initial: AdminRosterPage }) {
  const [error, setError] = useState("");
  const [rows, setRows] = useState(initial.rows);
  const [nextOffset, setNextOffset] = useState(initial.nextOffset);
  const [query, setQuery] = useState("");
  const [participation, setParticipation] = useState<"all" | "joined" | "not_joined">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  const selectedRoster = rows.find((row) => row.id === selectedRosterId) ?? null;
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  async function loadRoster(reset: boolean) {
    const offset = reset ? 0 : nextOffset;
    if (!reset && offset === null) return;
    setError("");
    const params = new URLSearchParams({
      q: query,
      participation,
      offset: String(offset ?? 0),
    });
    try {
      const page = await jsonRequest("/api/admin/roster?" + params.toString()) as AdminRosterPage;
      setRows((current) => reset ? page.rows : [...current, ...page.rows]);
      if (reset) setSelectedIds(new Set());
      setNextOffset(page.nextOffset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "명단을 불러오지 못했습니다.");
    }
  }

  function search(event: FormEvent) {
    event.preventDefault();
    void loadRoster(true);
  }

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
  }

  function openCreate() {
    setSelectedRosterId(null);
    setModalOpen(true);
  }

  function openEdit(row: AdminRosterRow) {
    setSelectedRosterId(row.id);
    setModalOpen(true);
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm("선택한 " + ids.length + "명을 로그인 허용 명단에서 삭제할까요?")) return;

    setBusy(true);
    setError("");
    try {
      await jsonRequest("/api/admin/roster", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      await loadRoster(true);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "REQUEST_FAILED";
      setError(code === "CANNOT_DELETE_SELF" ? "현재 로그인한 관리자 본인은 삭제할 수 없습니다." : code);
    } finally {
      setBusy(false);
    }
  }

  async function resetToInitialPassword() {
    if (!selectedRoster) return;
    if (!window.confirm("비밀번호를 등록된 전화번호로 초기화할까요?")) return;
    setBusy(true);
    setError("");
    try {
      await jsonRequest("/api/admin/roster/password", {
        method: "POST",
        body: JSON.stringify({ id: selectedRoster.id, mode: "initial" }),
      });
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "비밀번호를 초기화하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setImportMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.name) {
      setError("가져올 .xls 파일을 선택해 주세요.");
      return;
    }

    setImportBusy(true);
    try {
      const response = await fetch("/api/admin/roster/import", {
        method: "POST",
        body: data,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.summary) throw new Error(body.code ?? "ROSTER_IMPORT_FAILED");
      setImportMessage(
        "명단 " + body.summary.imported + "명 가져오기 완료 · 전화번호 없음 " + body.summary.missingPhone + "명",
      );
      form.reset();
      await loadRoster(true);
    } catch (cause) {
      setError(cause instanceof Error ? "명단 가져오기 실패: " + cause.message : "명단을 가져오지 못했습니다.");
    } finally {
      setImportBusy(false);
    }
  }

  async function submitRoster(formData: FormData) {
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

    setBusy(true);
    setError("");
    try {
      const saved = await jsonRequest("/api/admin/roster", {
        method: selectedRoster ? "PATCH" : "POST",
        body: JSON.stringify(selectedRoster ? { id: selectedRoster.id, ...payload } : payload),
      });
      const rosterId = selectedRoster?.id ?? String(saved.id ?? "");
      if (newPassword && rosterId) {
        await jsonRequest("/api/admin/roster/password", {
          method: "POST",
          body: JSON.stringify({ id: rosterId, mode: "custom", password: newPassword }),
        });
      }
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "명단을 저장하지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="admin-feature-page">
      <div className="section-heading">
        <section className="admin-page-heading">
          <p className="eyebrow">로그인 허용 명단</p>
          <h1>사용자 관리</h1>
          <p>공동체 명단, 로그인 기준 활성 상태, 관리자 권한과 비밀번호를 관리합니다.</p>
        </section>
        <div className="header-actions">
          <button className="primary-button compact-button" type="button" onClick={openCreate}>
            사용자 추가
          </button>
        </div>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      <section className="card admin-section">
        <form className="roster-import-form" onSubmit={submitImport}>
          <div>
            <strong>삼덕청년부 명단 가져오기</strong>
            <p className="helper-text">.xls 또는 .xlsx 파일을 가져옵니다. 예제의 이름 · 교회직분 · 핸드폰 · 마을 · 샘 열을 유지하고, 현재 관리자도 명단에 포함해 주세요. 기존 기도기록은 유지됩니다.</p>
            <a className="text-button" href="/templates/community-roster-example.xlsx" download="삼덕청년부-명단-예제.xlsx">삼덕청년부 명단 엑셀 예제 다운로드</a>
          </div>
          <input
            name="file"
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="삼덕청년부 엑셀 파일"
            required
            disabled={importBusy}
          />
          <button className="text-button" type="submit" disabled={importBusy}>
            {importBusy ? "가져오는 중..." : "명단 가져오기"}
          </button>
        </form>
        {importMessage && <p className="success-text" role="status">{importMessage}</p>}

        <details className="roster-disclosure">
        <summary>사용자 명단 · 현재 {rows.length}명 표시</summary>
        <p className="helper-text">활성은 한 번 이상 로그인한 사용자, 비활성은 아직 로그인하지 않은 사용자입니다. 기도운동 참여와 로그인 허용 여부는 별도입니다.</p>
        <form className="admin-filters roster-filters" onSubmit={search}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 전화번호 또는 샘" aria-label="허용 명단 검색" />
          <select value={participation} onChange={(event) => setParticipation(event.target.value as typeof participation)}>
            <option value="all">전체</option>
            <option value="joined">활성</option>
            <option value="not_joined">비활성</option>
          </select>
          <button className="text-button" type="submit">검색</button>
        </form>

        <div className="roster-selection-actions">
          <label className="checkbox-row">
            <input type="checkbox" checked={allSelected} disabled={busy} onChange={(event) => toggleAll(event.target.checked)} />
            표시된 사용자 전체 선택
          </label>
          <button className="text-button danger-button" type="button" disabled={selectedIds.size === 0 || busy} onClick={() => void deleteSelected()}>
            선택 삭제{selectedIds.size > 0 ? " (" + selectedIds.size + ")" : ""}
          </button>
        </div>

        <div className="admin-table roster-table">
          <div className="admin-row admin-row-head roster-row">
            <span className="roster-select-cell">
              <input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} aria-label="현재 표시 명단 전체 선택" />
            </span>
            <span>이름</span><span>직분</span><span>전화번호</span><span>샘</span>
            <span>비밀번호</span><span>상태</span><span>관리</span>
          </div>
          {rows.map((row) => (
            <div className="admin-row roster-row" key={row.id}>
              <span className="roster-select-cell">
                <input type="checkbox" checked={selectedIds.has(row.id)} onChange={(event) => toggle(row.id, event.target.checked)} aria-label={row.name + " 선택"} />
              </span>
              <span><strong>{row.name}</strong>{row.isAdmin && <small>관리자</small>}</span>
              <span>{row.position ?? "미지정"}</span>
              <span>{row.phone ?? "미등록"}</span>
              <span>{row.samLabel ?? "미지정"}</span>
              <span>{row.passwordMode === "initial" ? "초기(전화번호)" : "변경됨"}</span>
              <span>{row.joined ? "활성" : "비활성"}{row.isActive ? "" : " · 로그인 제한"}</span>
              <span><button className="text-button" type="button" onClick={() => openEdit(row)}>수정</button></span>
            </div>
          ))}
        </div>

        {nextOffset !== null && (
          <button className="text-button load-more-button" type="button" onClick={() => void loadRoster(false)}>더 보기</button>
        )}
        </details>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModalOpen(false)}>
          <div className="admin-modal" role="dialog" aria-modal="true" aria-label="사용자 관리" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setModalOpen(false)} aria-label="닫기">×</button>
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
                        ? "초기값: " + selectedRoster.phone
                        : "초기 비밀번호 사용 중 · 전화번호 미등록"
                      : "변경됨 · 원문은 보안상 저장하지 않습니다."}
                  </span>
                  <button className="text-button" type="button" disabled={busy} onClick={() => void resetToInitialPassword()}>
                    전화번호로 초기화
                  </button>
                </div>
              )}

              <label>
                새 비밀번호
                <input name="password" type="password" autoComplete="new-password" placeholder={selectedRoster ? "변경할 때만 입력" : "필요하면 입력"} />
              </label>
              <label className="checkbox-row"><input name="isActive" type="checkbox" defaultChecked={selectedRoster?.isActive ?? true} /> 로그인 허용</label>
              <label className="checkbox-row"><input name="isAdmin" type="checkbox" defaultChecked={selectedRoster?.isAdmin ?? false} /> 관리자</label>
              <button className="primary-button" type="submit" disabled={busy}>저장</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
