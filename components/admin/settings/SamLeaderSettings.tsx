"use client";

import { LeaderIdentityChoice, useLeaderIdentity, leaderStateText } from "./LeaderIdentityChoice";
import { VillageLeaderSettings } from "./VillageLeaderSettings";

import { fetchJson } from "../../../src/lib/fetch-json";
import { useEffect, useState, type FormEvent } from "react";
import type { AdminSamLeader } from "../../../src/features/sams/admin-service";

const MAX_SELECTED_LEADERS = 500;

async function readJson(url: string, init?: RequestInit) {
  return fetchJson<{ rows?: AdminSamLeader[]; summary: { imported: number }; deleted: number }>(url, { cache: "no-store", ...init });
}

function errorCopy(code: string): string {
  const messages: Record<string, string> = {
    LEADER_SELECTION_REQUIRED:"동명이인이 있습니다. 성도 명단을 확인해 한 분을 선택해 주세요.",
    LEADER_SELECTION_INVALID:"선택한 성도의 이름·소속이 변경되었습니다. 다시 확인해 주세요.",
    SAM_LEADER_FILE_TYPE: ".xls 또는 .xlsx 파일을 선택해 주세요.",
    SAM_LEADER_FILE_TOO_LARGE: "비어 있지 않은 2MB 이하의 파일을 선택해 주세요.",
    SAM_LEADER_FILE_REQUIRED: "샘 리더 파일을 선택해 주세요.",
    SAM_LEADER_FILE_INVALID: "엑셀 파일을 읽을 수 없습니다. 파일을 확인해 주세요.",
    SAM_LEADER_HEADERS_MISSING: "샘과 샘리더 열이 있는 파일을 선택해 주세요.",
    SAM_LEADER_ROW_INVALID: "모든 행의 샘 이름과 리더 이름을 확인해 주세요.",
    SAM_LEADER_FILE_EMPTY: "파일에 가져올 샘 리더 정보가 없습니다.",
    SAM_LEADER_DUPLICATE: "같은 샘이 중복되어 있습니다. 샘 이름을 확인해 주세요.",
    INVALID_INPUT: "샘과 리더 이름을 확인해 주세요.",
    SAM_LEADER_DELETE_FAILED: "샘 리더를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
  return messages[code] ?? "샘 리더 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function SamLeaderSettings() {
  const [rows, setRows] = useState<AdminSamLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<AdminSamLeader | null>(null);
  const [name,setName]=useState("");
  const [leaderName,setLeaderName]=useState("");
  const identity=useLeaderIdentity("sam",name,leaderName);
  function edit(row:AdminSamLeader|null){setEditing(row);setName(row?.name??"");setLeaderName(row?.leaderName??"");}
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectableRows = rows.slice(0, MAX_SELECTED_LEADERS);
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.has(row.id));

  useEffect(() => {
    let cancelled = false;
    void readJson("/api/admin/sams")
      .then((body) => { if (!cancelled) setRows(body.rows ?? []); })
      .catch((cause) => { if (!cancelled) setError(errorCopy(cause instanceof Error ? cause.message : "")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    const body = await readJson("/api/admin/sams");
    setRows(body.rows ?? []);
    setSelectedIds(new Set());
    window.dispatchEvent(new Event("pastoral:changed"));
  }

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        if (next.size >= MAX_SELECTED_LEADERS) return current;
        next.add(id);
      } else next.delete(id);
      return next;
    });
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (busy || ids.length === 0) return;
    if (!window.confirm(`선택한 ${ids.length}개 샘의 리더 정보를 삭제할까요? 성도 명단과 소속 샘은 유지됩니다.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await readJson("/api/admin/sams", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setRows((current) => current.filter((row) => !selectedIds.has(row.id)));
      setSelectedIds(new Set());
      if (editing && selectedIds.has(editing.id)) edit(null);
      setMessage(`${body.deleted}개 샘의 리더 정보를 삭제했습니다.`);
    } catch (cause) {
      setError(errorCopy(cause instanceof Error ? cause.message : ""));
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await readJson("/api/admin/sams/import", { method: "POST", body: new FormData(form) });
      await refresh();
      edit(null);
      setMessage(`${body.summary.imported}개 샘의 리더 정보를 가져왔습니다.`);
      form.reset();
    } catch (cause) {
      setError(errorCopy(cause instanceof Error ? cause.message : ""));
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if(!identity.canSave||busy)return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await readJson("/api/admin/sams", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          leaderName: String(data.get("leaderName") ?? ""),
          isActive: data.get("isActive") === "on",
          leaderRosterId:identity.rosterId,
        }),
      });
      await refresh();
      edit(null);
      setMessage("샘 리더 정보를 저장했습니다.");
      form.reset();
    } catch (cause) {
      setError(errorCopy(cause instanceof Error ? cause.message : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card admin-section" aria-labelledby="sam-leader-heading">
      <h2 id="sam-leader-heading">샘 리더 관리</h2>
      <p className="helper-text">샘 리더와 마을장을 회원 명단과 별도로 등록합니다. 샘 리더는 심방 일정에 표시되며, 마을장은 아래 마을장 등록에서 추가합니다.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {message && <p className="success-text" role="status">{message}</p>}
      <form className="roster-import-form" onSubmit={upload}>
        <div>
          <strong>샘 리더 파일 가져오기</strong>
          <p className="helper-text">마을 · 마을장 · 샘 · 샘리더 열의 엑셀 파일을 가져옵니다. 직분은 제외하고 이름을 저장합니다.</p>
          <a className="text-button" href="/templates/sam-leaders-example.xlsx" download="3D-샘리더-예제.xlsx">샘 리더 엑셀 예제 다운로드</a>
        </div>
        <input name="file" type="file" accept=".xls,.xlsx" aria-label="샘 리더 엑셀 파일" required disabled={busy} />
        <button type="submit" className="text-button" disabled={busy || loading}>가져오기</button>
      </form>

      {rows.some(row=>row.bindingState==="ambiguous")&&<p className="setting-warning" role="status">동명이인 확인이 필요한 샘 리더가 있습니다. 등록된 명단을 펼쳐 해당 리더의 수정 버튼을 눌러 주세요.</p>}
      <details className="roster-disclosure">
        <summary>등록된 샘 리더 {rows.length}개 확인</summary>
        {loading ? <p className="helper-text">불러오는 중...</p> : rows.length === 0 ? <p className="helper-text">등록된 샘 리더가 없습니다.</p> : (
          <>
          <div className="roster-selection-actions">
            <label className="checkbox-row">
              <input type="checkbox" checked={allSelected} disabled={busy} onChange={(event) => setSelectedIds(event.target.checked ? new Set(selectableRows.map((row) => row.id)) : new Set())} />
              {rows.length > MAX_SELECTED_LEADERS ? "샘 리더 500개 선택" : "샘 리더 전체 선택"}
            </label>
            <button type="button" className="text-button danger-button" disabled={busy || selectedIds.size === 0} onClick={() => void deleteSelected()}>
              선택 삭제{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </button>
          </div>
          {rows.length > MAX_SELECTED_LEADERS && <p className="helper-text">한 번에 최대 500개까지 선택할 수 있습니다. 삭제 후 나머지를 선택해 주세요.</p>}
          <ul className="sam-leader-list">
            {rows.map((row) => (
              <li key={row.id}>
                <label className="checkbox-row">
                  <input type="checkbox" checked={selectedIds.has(row.id)} disabled={busy || (selectedIds.size >= MAX_SELECTED_LEADERS && !selectedIds.has(row.id))} onChange={(event) => toggle(row.id, event.target.checked)} aria-label={`${row.name}샘 리더 선택`} />
                  <span><strong>{row.name}샘</strong> · {row.leaderName}{row.isActive ? "" : " · 비활성"} · {leaderStateText(row.bindingState)}</span>
                </label>
                <button type="button" className="text-button" disabled={busy} onClick={() => edit(row)} aria-label={`${row.name}샘 리더 수정`}>수정</button>
              </li>
            ))}
          </ul>
          </>
        )}
      </details>

      <form className="admin-form" key={editing?.id ?? "new"} onSubmit={save}>
        <h3>{editing ? `${editing.name}샘 리더 수정` : "샘 리더 추가"}</h3>
        <label>샘<input name="name" placeholder="예: 1-2" value={name} onChange={event=>setName(event.target.value)} readOnly={Boolean(editing)} maxLength={100} required disabled={busy} /></label>
        <label>리더 이름<input name="leaderName" value={leaderName} onChange={event=>setLeaderName(event.target.value)} maxLength={120} required disabled={busy} /></label>
        <LeaderIdentityChoice identity={identity}/>
        <label className="checkbox-row"><input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} disabled={busy} /> 리더 정보 사용</label>
        <div className="header-actions">
          <button type="submit" className="primary-button compact-button" disabled={busy || loading || !identity.canSave}>{busy ? "저장 중..." : "저장"}</button>
          {editing && <button type="button" className="text-button" disabled={busy} onClick={() => edit(null)}>취소</button>}
        </div>
      </form>
      <VillageLeaderSettings />
    </section>
  );
}
