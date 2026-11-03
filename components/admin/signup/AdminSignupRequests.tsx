"use client";

import { useEffect, useState } from "react";
import type { AdminSignupList, SignupRequestRow } from "../../../src/features/signup/types";

async function fetchRequests(): Promise<AdminSignupList> {
  const response = await fetch("/api/admin/signup-requests", { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code ?? "SIGNUP_LOAD_FAILED");
  return { pending: body.pending ?? [], recent: body.recent ?? [] };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function errorMessage(code: string): string {
  if (code === "SIGNUP_NOT_PENDING") return "이미 처리된 신청입니다. 목록을 새로 불러옵니다.";
  if (code === "ROSTER_DUPLICATE") return "이미 명단에 있는 사람입니다. 거절로 정리해 주세요.";
  return "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function PendingRow({
  row,
  busy,
  onDecide,
}: {
  row: SignupRequestRow;
  busy: boolean;
  onDecide: (row: SignupRequestRow, body: Record<string, string>) => void;
}) {
  const [approving, setApproving] = useState(false);
  const [position, setPosition] = useState("");
  const [village, setVillage] = useState("");
  const [sam, setSam] = useState("");

  return (
    <article className="admin-notice-row signup-row">
      <div>
        <div className="admin-notice-title-line">
          <strong>{row.name}</strong>
          {row.alreadyInRoster && <span className="status-pill">이미 명단에 있음</span>}
        </div>
        <p className="helper-text">
          {row.phone ?? "전화번호 확인 불가"} · {formatTime(row.createdAt)} 신청
        </p>
        {row.memo && <p className="helper-text">메모: {row.memo}</p>}
        {approving && (
          <div className="admin-form signup-approve-fields">
            <p className="helper-text">필요하면 직분·마을·샘을 함께 입력하세요. 나중에 사용자 관리에서도 바꿀 수 있습니다.</p>
            <label>직분 (선택)<input value={position} maxLength={80} onChange={(e) => setPosition(e.target.value)} disabled={busy} /></label>
            <label>마을 (선택)<input value={village} maxLength={80} onChange={(e) => setVillage(e.target.value)} disabled={busy} /></label>
            <label>샘 (선택)<input value={sam} maxLength={80} onChange={(e) => setSam(e.target.value)} disabled={busy} /></label>
          </div>
        )}
      </div>
      <div className="header-actions">
        {approving ? (
          <>
            <button className="primary-button compact-button" type="button" disabled={busy} onClick={() => onDecide(row, { action: "approve", position, village, sam })}>
              {busy ? "처리 중…" : "승인 확인"}
            </button>
            <button className="text-button" type="button" disabled={busy} onClick={() => setApproving(false)}>취소</button>
          </>
        ) : (
          <>
            <button className="text-button" type="button" disabled={busy || row.alreadyInRoster} onClick={() => setApproving(true)}>승인</button>
            <button className="text-button danger-button" type="button" disabled={busy} onClick={() => onDecide(row, { action: "reject" })}>거절</button>
          </>
        )}
      </div>
    </article>
  );
}

export function AdminSignupRequests() {
  const [data, setData] = useState<AdminSignupList>({ pending: [], recent: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setData(await fetchRequests());
    } catch {
      setError("가입 신청을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetchRequests()
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("가입 신청을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function decide(row: SignupRequestRow, body: Record<string, string>) {
    const approve = body.action === "approve";
    if (!approve && !window.confirm("‘" + row.name + "’ 님의 가입 신청을 거절할까요?")) return;
    setBusyId(row.id);
    setError("");
    try {
      const response = await fetch("/api/admin/signup-requests/" + row.id, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25_000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.code ?? "DECIDE_FAILED");
      if (approve) {
        // Reload so the newly added person also appears in the roster below.
        window.location.reload();
        return;
      }
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause instanceof Error ? cause.message : ""));
      await refresh();
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="card admin-section" aria-labelledby="signup-requests-title">
      <div className="section-heading">
        <h2 id="signup-requests-title">가입 신청{data.pending.length > 0 ? ` (${data.pending.length})` : ""}</h2>
      </div>
      <p className="helper-text">
        로그인 화면의 “가입 신청”으로 들어온 요청입니다. 승인하면 명단에 일반 성도로 추가되고, 신청자는 이름과 전화번호로 로그인할 수 있습니다.
      </p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {loading ? (
        <p className="helper-text">가입 신청을 불러오는 중입니다.</p>
      ) : data.pending.length === 0 ? (
        <p className="helper-text">대기 중인 가입 신청이 없습니다.</p>
      ) : (
        <div className="admin-notice-list">
          {data.pending.map((row) => (
            <PendingRow key={row.id} row={row} busy={busyId === row.id} onDecide={(r, body) => void decide(r, body)} />
          ))}
        </div>
      )}
      {data.recent.length > 0 && (
        <details className="signup-recent">
          <summary>최근 처리한 신청 {data.recent.length}건</summary>
          <ul>
            {data.recent.map((row) => (
              <li key={row.id}>
                <strong>{row.name}</strong>
                <span className={row.status === "approved" ? "status-pill is-success" : "status-pill"}>
                  {row.status === "approved" ? "승인" : "거절"}
                </span>
                <span className="helper-text">{row.decidedAt ? formatTime(row.decidedAt) : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
