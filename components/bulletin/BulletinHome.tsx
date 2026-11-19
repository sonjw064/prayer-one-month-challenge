"use client";

import Link from "next/link";
import { useState } from "react";
import { formatBulletinDate, pageUrl } from "../../src/features/bulletin/format";
import type { PublicBulletin } from "../../src/features/bulletin/service";
import { useBulletinPdf } from "./useBulletinPdf";

function Download({ bulletin }: { bulletin: PublicBulletin }) {
  const { busy, progress, error, download } = useBulletinPdf(bulletin);
  return (
    <>
      <button className="bul-pill" type="button" disabled={busy} onClick={() => void download()}>
        {busy ? progress : "⬇ 주보 다운로드"}
      </button>
      {error && <p className="error-text" role="alert">{error}</p>}
    </>
  );
}

export function BulletinHome({ bulletins }: { bulletins: PublicBulletin[] }) {
  const [selectedId, setSelectedId] = useState(bulletins[0]?.id ?? "");
  const selected = bulletins.find((item) => item.id === selectedId) ?? bulletins[0];

  if (!selected) {
    return (
      <div className="shell bulletin">
        <section className="feature-heading"><h2>주일 주보</h2></section>
        <section className="card empty-state">아직 올라온 주보가 없습니다. 주일 전후로 다시 확인해 주세요.</section>
      </div>
    );
  }
  const others = bulletins.filter((item) => item.id !== selected.id);

  return (
    <div className="shell bulletin">
      <section className="feature-heading">
        <h2>주일 주보</h2>
        <p>PDF를 내려받지 않아도 여기서 바로 볼 수 있습니다.</p>
      </section>

      <label className="bul-select">
        <span className="sr-only">주보 날짜 선택</span>
        <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
          {bulletins.map((item) => (
            <option key={item.id} value={item.id}>{formatBulletinDate(item.date)}</option>
          ))}
        </select>
      </label>

      <section className="card bul-cover" aria-label={`${selected.title} 표지`}>
        <Link href={`/bulletin/${selected.id}`} aria-label={`${formatBulletinDate(selected.date)} 주보 열기`}>
          {/* Authenticated-free stored image: plain <img> keeps the original page without the optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pageUrl(selected.id, 1, selected.version)} alt={`${selected.title} 1쪽 표지`} />
        </Link>
        <p className="helper-text">{selected.title} · 총 {selected.pageCount}쪽</p>
      </section>

      <div className="bul-actions">
        <Link className="primary-button bul-open" href={`/bulletin/${selected.id}`}>주보 보기</Link>
        <Download bulletin={selected} />
      </div>

      {others.length > 0 && (
        <section aria-label="이전 주보">
          <h3 className="bul-section">이전 주보 보기</h3>
          <ul className="bul-previous">
            {others.map((item) => (
              <li key={item.id}>
                <Link href={`/bulletin/${item.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pageUrl(item.id, 1, item.version, "thumb")} alt="" loading="lazy" />
                  <span>{formatBulletinDate(item.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
