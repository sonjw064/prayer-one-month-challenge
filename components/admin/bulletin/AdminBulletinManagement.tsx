"use client";

import { useEffect, useState } from "react";
import { openPdf } from "../../../src/features/bulletin/convert";
import { formatBulletinDate } from "../../../src/features/bulletin/format";
import {
  DEFAULT_TITLE,
  MAX_PAGES,
  MAX_SOURCE_PDF_BYTES,
  MAX_TITLE_LENGTH,
  RETENTION_DAYS,
  nextSunday,
} from "../../../src/features/bulletin/policy";
import type { AdminBulletin } from "../../../src/features/bulletin/service";

type Draft = { id: string; pageCount: number; date: string; title: string };
type Resume = { draft: Draft; nextPage: number };

const STATUS_LABEL = { draft: "임시(게시 전)", published: "게시됨", hidden: "숨김" } as const;

async function api(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.code ?? "REQUEST_FAILED"));
  return body;
}

function errorText(code: string): string {
  if (code === "DATE_EXPIRED") return "이미 보관 기간(30일)이 지난 날짜입니다. 최근 주일 날짜를 선택해 주세요.";
  if (code === "DATE_TOO_FAR") return "날짜가 너무 먼 미래입니다.";
  if (code === "INVALID_IMAGE" || code === "UNSUPPORTED_IMAGE_TYPE") return "페이지 이미지를 처리하지 못했습니다. 다른 PDF로 시도해 주세요.";
  if (code === "IMAGE_TOO_LARGE") return "페이지 이미지가 너무 큽니다.";
  if (code === "PAGES_INCOMPLETE") return "아직 모든 페이지가 올라가지 않았습니다. 다시 시도해 주세요.";
  if (code === "NOT_A_DRAFT") return "이미 게시된 주보입니다.";
  if (code === "INVALID_INPUT") return "입력 내용을 확인해 주세요.";
  if (code === "PDF_INVALID") return "PDF를 읽지 못했습니다. 손상되었거나 암호가 걸린 파일일 수 있습니다.";
  return "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function AdminBulletinManagement() {
  const [today, setToday] = useState("");
  const [bulletins, setBulletins] = useState<AdminBulletin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState("");
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [notify, setNotify] = useState(false);
  const [progress, setProgress] = useState("");
  const [resume, setResume] = useState<Resume | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  async function refresh() {
    const body = await api("/api/admin/bulletins", { cache: "no-store" });
    setBulletins(body.bulletins as AdminBulletin[]);
    return body.today as string;
  }

  useEffect(() => {
    let cancelled = false;
    api("/api/admin/bulletins", { cache: "no-store" })
      .then((body) => {
        if (cancelled) return;
        setBulletins(body.bulletins as AdminBulletin[]);
        setToday(body.today as string);
        setDate(nextSunday(body.today as string));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("주보 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function resetForm() {
    setFile(null);
    setFileKey((key) => key + 1);
    setTitle(DEFAULT_TITLE);
    setNotify(false);
    setResume(null);
    setDraft(null);
    setProgress("");
  }

  /** Converts the PDF page by page in this browser and uploads each page image. */
  async function upload(startWith: Resume | null) {
    if (!file || busy) return;
    if (file.size > MAX_SOURCE_PDF_BYTES) {
      setError(`PDF가 너무 큽니다(최대 ${MAX_SOURCE_PDF_BYTES / 1024 / 1024}MB).`);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    let pdf: Awaited<ReturnType<typeof openPdf>> | null = null;
    let current: Resume | null = startWith;
    try {
      setProgress("PDF를 읽는 중…");
      try {
        pdf = await openPdf(file);
      } catch {
        throw new Error("PDF_INVALID");
      }
      if (pdf.pageCount > MAX_PAGES) throw new Error(`TOO_MANY_PAGES:${pdf.pageCount}`);

      if (!current) {
        const created = await api("/api/admin/bulletins", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date, title, pageCount: pdf.pageCount }),
        });
        current = { draft: { id: created.id as string, pageCount: pdf.pageCount, date, title }, nextPage: 1 };
      } else if (current.draft.pageCount !== pdf.pageCount) {
        throw new Error("PDF_CHANGED");
      }

      for (let page = current.nextPage; page <= current.draft.pageCount; page += 1) {
        setProgress(`${page}/${current.draft.pageCount}쪽 변환·업로드 중…`);
        const rendered = await pdf.renderPage(page);
        await api(`/api/admin/bulletins/${current.draft.id}/pages/${page}`, {
          method: "PUT",
          headers: { "content-type": "image/jpeg" },
          body: rendered.blob,
        });
        current = { ...current, nextPage: page + 1 };
      }
      setResume(null);
      setDraft(current.draft);
      setProgress("");
      await refresh();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      if (code.startsWith("TOO_MANY_PAGES")) setError(`페이지가 ${MAX_PAGES}장을 넘습니다(${code.split(":")[1]}장).`);
      else if (code === "PDF_CHANGED") setError("처음에 올리던 PDF와 다른 파일입니다. 같은 파일을 선택하거나 처음부터 다시 시작해 주세요.");
      else setError(errorText(code));
      // A failed page can be retried without starting over.
      if (current) setResume(current);
      setProgress("");
    } finally {
      if (pdf) await pdf.close().catch(() => undefined);
      setBusy(false);
    }
  }

  async function publish() {
    if (!draft || busy) return;
    const clash = bulletins.find((item) => item.date === draft.date && item.status !== "draft" && item.id !== draft.id);
    if (clash && !window.confirm(`${formatBulletinDate(draft.date)} 주보가 이미 있습니다. 게시하면 새 주보로 교체됩니다. 계속할까요?`)) return;
    setBusy(true);
    setError("");
    try {
      const body = await api(`/api/admin/bulletins/${draft.id}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notify }),
      });
      setMessage(
        "주보를 게시했습니다." +
          (body.replaced ? " 같은 날짜의 기존 주보는 교체되었습니다." : "") +
          (body.push === "sent" ? " 알림도 보냈습니다." : body.push === "failed" ? " 알림은 보내지 못했습니다." : ""),
      );
      resetForm();
      await refresh();
    } catch (cause) {
      setError(errorText(cause instanceof Error ? cause.message : ""));
    } finally {
      setBusy(false);
    }
  }

  async function removeBulletin(id: string, label: string, skipConfirm = false) {
    if (busy) return;
    if (!skipConfirm && !window.confirm(`${label} 주보를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/bulletins/${id}`, { method: "DELETE" });
      if (draft?.id === id) resetForm();
      setMessage("주보를 삭제했습니다.");
      await refresh();
    } catch (cause) {
      setError(errorText(cause instanceof Error ? cause.message : ""));
    } finally {
      setBusy(false);
    }
  }

  async function setVisibility(id: string, status: "published" | "hidden") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/bulletins/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (cause) {
      setError(errorText(cause instanceof Error ? cause.message : ""));
    } finally {
      setBusy(false);
    }
  }

  const canStart = !!file && !!date && !busy && !draft && !resume;

  return (
    <div className="admin-feature-page">
      <section className="admin-page-heading">
        <p className="eyebrow">주일 주보</p>
        <h1>주보 관리</h1>
        <p>PDF를 올리면 페이지 이미지로 변환해 앱에서 바로 볼 수 있게 합니다. 로그인하지 않은 사람도 볼 수 있습니다.</p>
      </section>

      {error && <p className="error-text" role="alert">{error}</p>}
      {message && <p className="success-text" role="status">{message}</p>}

      <section className="card admin-section" aria-label="주보 올리기">
        <h2>새 주보 올리기</h2>
        <div className="admin-form">
          <label>
            주보 PDF
            <input
              key={fileKey}
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy || !!draft}
              onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResume(null); setError(""); }}
            />
          </label>
          <label>
            주보 날짜 (주일)
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={busy || !!draft || !!resume} />
          </label>
          <label>
            제목
            <input value={title} maxLength={MAX_TITLE_LENGTH} onChange={(event) => setTitle(event.target.value)} disabled={busy || !!draft || !!resume} />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} disabled={busy} />
            게시하면서 성도에게 알림 보내기
          </label>
        </div>
        <p className="helper-text">
          PDF는 이 화면에서 읽어 페이지 이미지로만 저장합니다. 원본 PDF(수십 MB)는 저장하지 않습니다. 최대 {MAX_PAGES}쪽까지 올릴 수 있습니다.
          주보 날짜로부터 {RETENTION_DAYS}일이 지나면 자동으로 보이지 않게 되고 삭제됩니다. 주보에 연락처 같은 개인정보가 없는지 확인해 주세요.
        </p>
        {progress && <p className="helper-text" role="status">{progress}</p>}
        <div className="admin-editor-actions">
          {resume ? (
            <>
              <button className="primary-button compact-button" type="button" disabled={busy || !file} onClick={() => void upload(resume)}>
                {busy ? "올리는 중…" : `${resume.nextPage}쪽부터 다시 시도`}
              </button>
              <button className="text-button" type="button" disabled={busy} onClick={() => void removeBulletin(resume.draft.id, "올리던", true).then(resetForm)}>
                처음부터 다시
              </button>
            </>
          ) : (
            !draft && (
              <button className="primary-button compact-button" type="button" disabled={!canStart} onClick={() => void upload(null)}>
                {busy ? "올리는 중…" : "변환하고 올리기"}
              </button>
            )
          )}
        </div>

        {draft && (
          <div className="bul-draft" aria-label="게시 전 미리보기">
            <h3>미리보기 · {draft.pageCount}쪽</h3>
            <ul className="bul-thumbs">
              {Array.from({ length: draft.pageCount }, (_, index) => index + 1).map((page) => (
                <li key={page}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/admin/bulletins/${draft.id}/pages/${page}?size=thumb`} alt={`${page}쪽`} loading="lazy" />
                </li>
              ))}
            </ul>
            <p className="helper-text">{formatBulletinDate(draft.date)} · {draft.title}. 게시하기 전에는 성도에게 보이지 않습니다.</p>
            <div className="admin-editor-actions">
              <button className="primary-button compact-button" type="button" disabled={busy} onClick={() => void publish()}>
                {busy ? "게시 중…" : "게시하기"}
              </button>
              <button className="text-button danger-button" type="button" disabled={busy} onClick={() => void removeBulletin(draft.id, "올린", true)}>
                취소(삭제)
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card admin-section" aria-label="주보 목록">
        <h2>올린 주보</h2>
        {loading ? (
          <p className="helper-text">불러오는 중입니다.</p>
        ) : bulletins.length === 0 ? (
          <p className="helper-text">올린 주보가 없습니다.</p>
        ) : (
          <div className="admin-notice-list">
            {bulletins.map((item) => {
              const label = formatBulletinDate(item.date);
              return (
                <article className="admin-notice-row" key={item.id}>
                  <div>
                    <div className="admin-notice-title-line">
                      <strong>{label}</strong>
                      <span className={item.status === "published" ? "status-pill is-success" : "status-pill"}>{STATUS_LABEL[item.status]}</span>
                      {item.expired && <span className="status-pill">기간 지남(곧 삭제)</span>}
                    </div>
                    <p className="helper-text">
                      {item.title} · {item.status === "draft" ? `${item.uploadedPages}/${item.pageCount}쪽 업로드됨` : `${item.pageCount}쪽`}
                    </p>
                  </div>
                  <div className="header-actions">
                    {item.status === "published" && <a className="text-button" href={`/bulletin/${item.id}`} target="_blank" rel="noreferrer">보기</a>}
                    {item.status === "published" && <button className="text-button" type="button" disabled={busy} onClick={() => void setVisibility(item.id, "hidden")}>숨기기</button>}
                    {item.status === "hidden" && <button className="text-button" type="button" disabled={busy} onClick={() => void setVisibility(item.id, "published")}>다시 게시</button>}
                    <button className="text-button danger-button" type="button" disabled={busy} onClick={() => void removeBulletin(item.id, label)}>삭제</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <p className="helper-text">{today && `오늘 기준 ${RETENTION_DAYS}일이 지난 주보는 목록을 열 때 자동으로 정리됩니다.`}</p>
      </section>
    </div>
  );
}
