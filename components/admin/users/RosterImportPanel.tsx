"use client";

import { FormEvent, ReactNode, useRef, useState } from "react";
import type { ImportValidationError, RosterImportPreview } from "../../../src/features/roster/import";

type ErrorBody = { code?: string; errors?: ImportValidationError[] };

function describeError(code: string, errors: ImportValidationError[] | undefined): string {
  if (code === "ROSTER_VALIDATION_FAILED" && errors?.length) {
    const lines = errors.slice(0, 5).map((error) =>
      error.code === "MISSING_NAME"
        ? `${error.sourceRows.join(", ")}번째 줄: 이름이 비어 있습니다.`
        : `${error.sourceRows.join(", ")}번째 줄: 같은 이름과 전화번호가 중복됩니다.`,
    );
    return `파일을 확인해 주세요. ${lines.join(" ")}${errors.length > 5 ? ` 외 ${errors.length - 5}건` : ""}`;
  }
  if (code === "ROSTER_FILE_TYPE") return ".xls 또는 .xlsx 파일만 가져올 수 있습니다.";
  if (code === "ROSTER_FILE_TOO_LARGE") return "파일이 너무 큽니다. 2MB 이하의 파일을 선택해 주세요.";
  if (code === "ROSTER_HEADERS_MISSING") return "이름 · 교회직분 · 핸드폰 · 마을 · 샘 열을 찾지 못했습니다. 예제의 형식을 확인해 주세요.";
  if (code === "MISSING_ROSTER_ENCRYPTION_KEY") return "서버 설정(명단 암호화 키)이 없어 가져올 수 없습니다.";
  return "명단을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

async function send(file: File, mode: "preview" | "apply") {
  const data = new FormData();
  data.set("file", file);
  data.set("mode", mode);
  const response = await fetch("/api/admin/roster/import", {
    method: "POST",
    body: data,
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = body as ErrorBody;
    throw new Error(describeError(failure.code ?? "", failure.errors));
  }
  return body;
}

function More({ shown, total }: { shown: number; total: number }) {
  return total > shown ? <li className="helper-text">외 {total - shown}명</li> : null;
}

export function RosterImportPanel({
  accept,
  ariaLabel,
  helper,
  extra,
  onImported,
}: {
  accept: string;
  ariaLabel: string;
  helper: string;
  extra?: ReactNode;
  onImported: () => Promise<void> | void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RosterImportPreview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "apply">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function runPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chosen = new FormData(event.currentTarget).get("file");
    if (!(chosen instanceof File) || !chosen.name) {
      setError("가져올 엑셀 파일을 선택해 주세요.");
      return;
    }
    setBusy("preview");
    setError("");
    setMessage("");
    setPreview(null);
    try {
      const body = await send(chosen, "preview");
      setFile(chosen);
      setPreview(body.preview as RosterImportPreview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "명단을 확인하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function apply() {
    if (!file || busy) return;
    setBusy("apply");
    setError("");
    try {
      const body = await send(file, "apply");
      const summary = body.summary as { added: number; updated: number };
      setMessage(`가져오기 완료 · 새로 추가 ${summary.added}명 · 정보 변경 ${summary.updated}명`);
      setPreview(null);
      setFile(null);
      formRef.current?.reset();
      await onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "명단을 가져오지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  function cancel() {
    setPreview(null);
    setFile(null);
    setError("");
    formRef.current?.reset();
  }

  const summary = preview?.summary;
  const nothingToDo = summary ? summary.added === 0 && summary.updated === 0 : false;

  return (
    <div className="roster-import">
      <form ref={formRef} className="roster-import-form" onSubmit={(event) => void runPreview(event)}>
        <div>
          <strong>삼덕청년부 명단 가져오기</strong>
          <p className="helper-text">{helper}</p>
          {extra}
        </div>
        <input
          name="file"
          type="file"
          accept={accept}
          aria-label={ariaLabel}
          required
          disabled={busy !== ""}
          onChange={() => { setPreview(null); setFile(null); setError(""); setMessage(""); }}
        />
        <button className="text-button" type="submit" disabled={busy !== ""}>
          {busy === "preview" ? "확인 중..." : "미리보기"}
        </button>
      </form>

      {error && <p className="error-text" role="alert">{error}</p>}
      {message && <p className="success-text" role="status">{message}</p>}

      {preview && summary && (
        <section className="roster-import-preview" aria-label="가져오기 미리보기">
          <h3>가져오기 미리보기</h3>
          <ul className="roster-import-counts">
            <li><strong>새로 추가</strong> {summary.added}명</li>
            <li><strong>정보 변경</strong> {summary.updated}명</li>
            <li><strong>변경 없음</strong> {summary.unchanged}명</li>
            <li><strong>파일에 없는 기존 명단</strong> {summary.notInFile}명 (그대로 유지)</li>
            {summary.skipped > 0 && <li><strong>확인 필요(건너뜀)</strong> {summary.skipped}명</li>}
            {summary.missingPhone > 0 && <li><strong>전화번호 없음</strong> {summary.missingPhone}명 (로그인 불가)</li>}
          </ul>
          <p className="helper-text">
            삭제되는 사람은 없습니다. 관리자 권한과 로그인 제한 상태는 바뀌지 않고, 파일의 빈 칸은 기존 값을 지우지 않습니다.
          </p>

          {preview.added.length > 0 && (
            <details open>
              <summary>새로 추가되는 사람</summary>
              <ul>
                {preview.added.map((entry, index) => <li key={`${entry.name}-${index}`}>{entry.name}</li>)}
                <More shown={preview.added.length} total={summary.added} />
              </ul>
            </details>
          )}
          {preview.updated.length > 0 && (
            <details open>
              <summary>정보가 바뀌는 사람</summary>
              <ul>
                {preview.updated.map((entry, index) => (
                  <li key={`${entry.name}-${index}`}>
                    <strong>{entry.name}</strong>{" "}
                    <span className="helper-text">{entry.changes.join(" · ") || "관리자 지정"}</span>
                  </li>
                ))}
                <More shown={preview.updated.length} total={summary.updated} />
              </ul>
            </details>
          )}
          {preview.skipped.length > 0 && (
            <details open>
              <summary>같은 이름이라 구분할 수 없어 건너뛰는 사람</summary>
              <ul>
                {preview.skipped.map((entry, index) => (
                  <li key={`${entry.name}-${index}`}>{entry.sourceRow}번째 줄 · {entry.name}</li>
                ))}
                <More shown={preview.skipped.length} total={summary.skipped} />
              </ul>
              <p className="helper-text">전화번호를 입력하거나 사용자 추가로 직접 등록해 주세요.</p>
            </details>
          )}

          <div className="header-actions">
            <button className="primary-button compact-button" type="button" disabled={busy !== "" || nothingToDo} onClick={() => void apply()}>
              {busy === "apply" ? "가져오는 중..." : nothingToDo ? "변경할 내용이 없습니다" : "이대로 가져오기"}
            </button>
            <button className="text-button" type="button" disabled={busy !== ""} onClick={cancel}>취소</button>
          </div>
        </section>
      )}
    </div>
  );
}
