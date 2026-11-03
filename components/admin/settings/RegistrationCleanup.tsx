"use client";

import { useEffect, useState } from "react";
import {
  CONFIRM_DELETE,
  CONFIRM_RESET,
  canDeleteSam,
  type RegistrationAction,
  type RegistrationKind,
  type RegistrationList,
  type RegistrationResult,
} from "../../../src/features/sams/registrations-types";

type Pending = { kind: RegistrationKind; action: RegistrationAction };

const ACTION_LABEL: Record<RegistrationAction, string> = { delete: "삭제", archive: "보관", restore: "다시 사용" };

function errorText(code: string | undefined): string {
  if (code === "CONFIRM_REQUIRED") return "확인 문구를 정확히 입력해 주세요.";
  if (code === "INVALID_INPUT") return "선택한 항목을 확인해 주세요.";
  return "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(result.code));
  return result;
}

/** Loads the lists without touching React state; callers apply the result from callbacks or event handlers. */
async function fetchData() {
  const [registrations, groups] = await Promise.all([
    fetch("/api/admin/registrations", { cache: "no-store" }),
    fetch("/api/admin/roster/reset-groups", { cache: "no-store" }),
  ]);
  if (!registrations.ok || !groups.ok) throw new Error("LOAD_FAILED");
  return {
    list: (await registrations.json()) as RegistrationList,
    affected: ((await groups.json()) as { affected: number }).affected,
  };
}

export function RegistrationCleanup() {
  const [list, setList] = useState<RegistrationList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Record<RegistrationKind, Set<string>>>({ sam: new Set(), village: new Set() });
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [affected, setAffected] = useState<number | null>(null);
  const [resetText, setResetText] = useState("");

  async function refresh() {
    const data = await fetchData();
    setList(data.list);
    setAffected(data.affected);
  }

  useEffect(() => {
    let cancelled = false;
    fetchData()
      .then((data) => {
        if (cancelled) return;
        setList(data.list);
        setAffected(data.affected);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("등록 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function toggle(kind: RegistrationKind, id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current[kind]);
      if (checked) next.add(id); else next.delete(id);
      return { ...current, [kind]: next };
    });
  }

  function choose(kind: RegistrationKind, ids: string[]) {
    setPending(null);
    setSelected((current) => ({ ...current, [kind]: new Set(ids) }));
  }

  async function execute(kind: RegistrationKind, action: RegistrationAction, confirm: string) {
    const ids = [...selected[kind]];
    if (ids.length === 0 || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await postJson("/api/admin/registrations", { kind, action, ids, confirm });
      const result = body.result as RegistrationResult;
      setMessage(
        `${result.processed}개를 ${ACTION_LABEL[action]} 처리했습니다.` +
          (result.skipped > 0
            ? action === "delete"
              ? ` ${result.skipped}개는 목양지 제출 기록이 있어 삭제하지 못했습니다. 이런 샘은 '보관'을 사용하세요.`
              : ` ${result.skipped}개는 이미 처리되었거나 찾을 수 없어 건너뛰었습니다.`
            : ""),
      );
      setSelected((current) => ({ ...current, [kind]: new Set() }));
      setPending(null);
      setConfirmText("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : errorText(undefined));
    } finally {
      setBusy(false);
    }
  }

  function start(kind: RegistrationKind, action: RegistrationAction) {
    const count = selected[kind].size;
    if (count === 0) return;
    setMessage("");
    setError("");
    if (action !== "delete") {
      void execute(kind, action, "");
    } else if (count > 1) {
      setConfirmText("");
      setPending({ kind, action });
    } else if (window.confirm("선택한 1개를 삭제할까요?")) {
      void execute(kind, action, "");
    }
  }

  async function resetGroups() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await postJson("/api/admin/roster/reset-groups", { confirm: resetText });
      setMessage(`${body.cleared}명의 마을·샘 정보를 비웠습니다. 이제 새 명단을 가져오세요.`);
      setResetText("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : errorText(undefined));
    } finally {
      setBusy(false);
    }
  }

  async function downloadRoster() {
    setError("");
    try {
      const response = await fetch("/api/admin/roster/export", { cache: "no-store" });
      if (!response.ok) throw new Error("EXPORT_FAILED");
      const blob = await response.blob();
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get("content-disposition") ?? "")?.[1];
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = encoded ? decodeURIComponent(encoded) : "삼덕청년부-명단.xlsx";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("명단을 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  const sams = list?.sams ?? [];
  const villages = list?.villages ?? [];

  function renderToolbar(kind: RegistrationKind) {
    const count = selected[kind].size;
    return (
      <div className="reg-toolbar">
        <button className="text-button" type="button" disabled={busy} onClick={() => choose(kind, (kind === "sam" ? sams : villages).map((row) => row.id))}>전체 선택</button>
        {kind === "sam" && (
          <button className="text-button" type="button" disabled={busy} onClick={() => choose("sam", sams.filter(canDeleteSam).map((row) => row.id))}>
            삭제 가능한 샘만 선택
          </button>
        )}
        <button className="text-button" type="button" disabled={busy || count === 0} onClick={() => choose(kind, [])}>선택 해제</button>
        <span className="helper-text">{count}개 선택</span>
        <button className="text-button danger-button" type="button" disabled={busy || count === 0} onClick={() => start(kind, "delete")}>삭제</button>
        <button className="text-button" type="button" disabled={busy || count === 0} onClick={() => start(kind, "archive")}>보관</button>
        <button className="text-button" type="button" disabled={busy || count === 0} onClick={() => start(kind, "restore")}>다시 사용</button>
      </div>
    );
  }

  function renderConfirm(kind: RegistrationKind) {
    if (!pending || pending.kind !== kind) return null;
    const blocked = kind === "sam" ? sams.filter((sam) => selected.sam.has(sam.id) && !canDeleteSam(sam)).length : 0;
    return (
      <div className="reg-confirm" role="alertdialog" aria-label="삭제 확인">
        <p>
          선택한 <strong>{selected[kind].size}개</strong>를 삭제합니다. 되돌릴 수 없습니다.
          {blocked > 0 && ` 이 중 ${blocked}개는 목양지 제출 기록이 있어 삭제되지 않고 건너뜁니다.`}
        </p>
        <label>
          확인을 위해 <strong>{CONFIRM_DELETE}</strong>를 입력하세요
          <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} disabled={busy} autoComplete="off" />
        </label>
        <div className="header-actions">
          <button className="primary-button compact-button" type="button" disabled={busy || confirmText.trim() !== CONFIRM_DELETE} onClick={() => void execute(kind, "delete", confirmText)}>
            {busy ? "처리 중…" : "삭제 실행"}
          </button>
          <button className="text-button" type="button" disabled={busy} onClick={() => setPending(null)}>취소</button>
        </div>
      </div>
    );
  }

  return (
    <section className="card admin-section" aria-label="등록 정리와 새해 준비">
      <details className="roster-disclosure">
        <summary>등록 정리 · 새해 준비 (샘·마을장 삭제/보관, 명단 마을·샘 초기화)</summary>

        <h3>매년 마을과 샘이 바뀔 때 (새해 준비)</h3>
        <ol className="reg-steps">
          <li>
            <strong>현재 명단을 엑셀로 내려받아 백업</strong>합니다.{" "}
            <button className="text-button" type="button" onClick={() => void downloadRoster()}>명단 내려받기</button>
          </li>
          <li>지난해 <strong>샘과 마을장 등록을 보관</strong>합니다(아래 표에서 전체 선택 → 보관). 기록은 남고 모든 목록에서 사라집니다.</li>
          <li><strong>명단의 마을·샘 정보를 비웁니다.</strong>(아래) 새 파일에 없는 사람이 작년 샘으로 남는 것을 막습니다.</li>
          <li>위의 <strong>명단 가져오기</strong>로 새 명단을 미리보기 후 가져옵니다.</li>
          <li><strong>샘 리더 엑셀</strong>을 가져오고 <strong>마을장</strong>을 등록합니다. 같은 이름의 보관된 샘은 다시 사용 상태가 됩니다.</li>
          <li>샘원 관리 화면에서 새 샘별 인원이 맞는지 확인합니다.</li>
        </ol>

        {error && <p className="error-text" role="alert">{error}</p>}
        {message && <p className="success-text" role="status">{message}</p>}
        {loading ? <p className="helper-text">등록 목록을 불러오는 중입니다.</p> : (
          <>
            <h3>샘 등록 {sams.length}개</h3>
            <p className="helper-text">리더 이름을 비운 샘과 테스트로 만든 샘도 모두 보입니다. 목양지 제출 기록이 있는 샘은 삭제할 수 없고 보관만 할 수 있습니다. 출석 기록은 샘을 삭제해도 남습니다.</p>
            {renderToolbar("sam")}
            {renderConfirm("sam")}
            {sams.length === 0 ? <p className="helper-text">등록된 샘이 없습니다.</p> : (
              <div className="att-scroll">
                <table className="att-table reg-table">
                  <thead><tr><th scope="col"><span className="sr-only">선택</span></th><th scope="col">샘</th><th scope="col">리더</th><th scope="col">상태</th><th scope="col">소속 인원</th><th scope="col">목양지 제출</th><th scope="col">출석 기록</th></tr></thead>
                  <tbody>
                    {sams.map((sam) => (
                      <tr key={sam.id}>
                        <td><input type="checkbox" aria-label={`${sam.name} 선택`} checked={selected.sam.has(sam.id)} disabled={busy} onChange={(e) => toggle("sam", sam.id, e.target.checked)} /></td>
                        <th scope="row">{sam.name}</th>
                        <td>{sam.leaderName || "리더 없음"}</td>
                        <td>{sam.isActive ? "사용" : "보관"}</td>
                        <td>{sam.members}명</td>
                        <td>{sam.reports}건{!canDeleteSam(sam) && " (삭제 불가)"}</td>
                        <td>{sam.attendanceSessions}건</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3>마을장 등록 {villages.length}개</h3>
            {renderToolbar("village")}
            {renderConfirm("village")}
            {villages.length === 0 ? <p className="helper-text">등록된 마을장이 없습니다.</p> : (
              <div className="att-scroll">
                <table className="att-table reg-table">
                  <thead><tr><th scope="col"><span className="sr-only">선택</span></th><th scope="col">마을</th><th scope="col">마을장</th><th scope="col">상태</th><th scope="col">소속 인원</th></tr></thead>
                  <tbody>
                    {villages.map((village) => (
                      <tr key={village.id}>
                        <td><input type="checkbox" aria-label={`${village.name} 선택`} checked={selected.village.has(village.id)} disabled={busy} onChange={(e) => toggle("village", village.id, e.target.checked)} /></td>
                        <th scope="row">{village.name}</th>
                        <td>{village.leaderName}</td>
                        <td>{village.isActive ? "사용" : "보관"}</td>
                        <td>{village.members}명</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3>명단의 마을·샘 정보 비우기</h3>
            <p className="helper-text">
              모든 성도의 <strong>마을과 샘</strong> 값만 비웁니다. 이름, 직분, 전화번호, 관리자 권한, 로그인 제한과 기도 기록은 그대로입니다.
              비운 뒤에는 샘 리더·마을장이 새 명단을 가져올 때까지 샘원 목록과 권한이 비어 있습니다. <strong>먼저 위 1번으로 백업하세요.</strong>
            </p>
            <p><strong>지금 마을 또는 샘 값이 있는 성도: {affected ?? "?"}명</strong></p>
            <div className="reg-confirm">
              <label>
                확인을 위해 <strong>{CONFIRM_RESET}</strong>를 입력하세요
                <input value={resetText} onChange={(event) => setResetText(event.target.value)} disabled={busy} autoComplete="off" />
              </label>
              <button className="text-button danger-button" type="button" disabled={busy || resetText.trim() !== CONFIRM_RESET || affected === 0} onClick={() => void resetGroups()}>
                마을·샘 정보 비우기
              </button>
            </div>
          </>
        )}
      </details>
    </section>
  );
}
