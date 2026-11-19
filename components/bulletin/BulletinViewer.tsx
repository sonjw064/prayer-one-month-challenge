"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatBulletinDate, pageUrl } from "../../src/features/bulletin/format";
import type { PublicBulletin } from "../../src/features/bulletin/service";
import { useBulletinPdf } from "./useBulletinPdf";

const ZOOM_STEPS = [1, 1.5, 2, 3];
const SWIPE_DISTANCE = 50;

export function BulletinViewer({ bulletin, all }: { bulletin: PublicBulletin; all: PublicBulletin[] }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [message, setMessage] = useState("");
  const touchStart = useRef<number | null>(null);
  const { busy, progress, error, download } = useBulletinPdf(bulletin);
  const zoom = ZOOM_STEPS[zoomIndex];
  const last = bulletin.pageCount;

  function go(next: number) {
    setPage(Math.min(last, Math.max(1, next)));
    setZoomIndex(0);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.key === "ArrowRight") setPage((current) => Math.min(last, current + 1));
      if (event.key === "ArrowLeft") setPage((current) => Math.max(1, current - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  // Warm the cache for the neighbouring pages so flipping feels instant.
  useEffect(() => {
    for (const neighbour of [page + 1, page - 1]) {
      if (neighbour >= 1 && neighbour <= last) new Image().src = pageUrl(bulletin.id, neighbour, bulletin.version);
    }
  }, [page, last, bulletin.id, bulletin.version]);

  async function share() {
    const url = `${window.location.origin}/bulletin/${bulletin.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${bulletin.title} ${formatBulletinDate(bulletin.date)}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage("링크를 복사했습니다.");
    } catch {
      // The person closed the share sheet or clipboard access was refused: nothing to report.
    }
  }

  function onTouchEnd(clientX: number) {
    const start = touchStart.current;
    touchStart.current = null;
    if (start === null || zoom > 1) return; // while zoomed in, a drag scrolls the page instead
    const distance = clientX - start;
    if (distance <= -SWIPE_DISTANCE) go(page + 1);
    else if (distance >= SWIPE_DISTANCE) go(page - 1);
  }

  return (
    <div className="shell bulletin bul-viewer">
      <header className="bul-header">
        <div>
          <Link className="text-button" href="/bulletin">← 주보 목록</Link>
          <h2>{bulletin.title}</h2>
        </div>
        <div className="bul-tools">
          <button className="bul-icon" type="button" onClick={() => void share()} aria-label="링크 공유">공유</button>
          <button className="bul-icon" type="button" disabled={busy} onClick={() => void download()} aria-label="PDF로 저장">
            {busy ? progress : "PDF 저장"}
          </button>
        </div>
      </header>

      {all.length > 1 && (
        <label className="bul-select">
          <span className="sr-only">주보 날짜 선택</span>
          <select value={bulletin.id} onChange={(event) => router.push(`/bulletin/${event.target.value}`)}>
            {all.map((item) => (
              <option key={item.id} value={item.id}>{formatBulletinDate(item.date)}</option>
            ))}
          </select>
        </label>
      )}
      {all.length <= 1 && <p className="helper-text">{formatBulletinDate(bulletin.date)}</p>}
      {message && <p className="helper-text" role="status">{message}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}

      <div
        className="bul-stage"
        onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }}
        onTouchEnd={(event) => onTouchEnd(event.changedTouches[0].clientX)}
      >
        <button className="bul-nav is-prev" type="button" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="이전 쪽">‹</button>
        <div className={zoom > 1 ? "bul-scroll is-zoomed" : "bul-scroll"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="bul-page"
            style={{ width: `${zoom * 100}%` }}
            src={pageUrl(bulletin.id, page, bulletin.version)}
            alt={`${bulletin.title} ${page}쪽`}
          />
        </div>
        <button className="bul-nav is-next" type="button" disabled={page >= last} onClick={() => go(page + 1)} aria-label="다음 쪽">›</button>
      </div>

      <div className="bul-controls">
        <button className="text-button" type="button" disabled={zoomIndex === 0} onClick={() => setZoomIndex((i) => Math.max(0, i - 1))} aria-label="축소">－</button>
        <span className="bul-counter" aria-live="polite">{page} / {last}</span>
        <button className="text-button" type="button" disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))} aria-label="확대">＋</button>
      </div>

      <ul className="bul-thumbs" aria-label="쪽 목록">
        {Array.from({ length: last }, (_, index) => index + 1).map((number) => (
          <li key={number}>
            <button type="button" className={number === page ? "is-current" : undefined} aria-current={number === page ? "page" : undefined} aria-label={`${number}쪽으로 이동`} onClick={() => go(number)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pageUrl(bulletin.id, number, bulletin.version, "thumb")} alt="" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
