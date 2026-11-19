"use client";

import { useState } from "react";
import { pageUrl, pdfFileName } from "../../src/features/bulletin/format";
import { buildPdf, type PdfPage } from "../../src/features/bulletin/pdf-writer";
import type { PublicBulletin } from "../../src/features/bulletin/service";

type Bulletin = Pick<PublicBulletin, "id" | "date" | "title" | "pageCount" | "version">;

async function toJpeg(blob: Blob): Promise<PdfPage> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("CANVAS_UNAVAILABLE");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  const result = { width: canvas.width, height: canvas.height };
  bitmap.close();
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  canvas.width = 0;
  canvas.height = 0;
  if (!jpeg) throw new Error("ENCODE_FAILED");
  return { jpeg: new Uint8Array(await jpeg.arrayBuffer()), ...result };
}

/**
 * "PDF로 저장": the original (often 50MB) PDF is not kept, so a light PDF is built here in the browser
 * from the stored page images.
 */
export function useBulletinPdf(bulletin: Bulletin) {
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState("");
  const busy = progress !== "";

  async function download() {
    if (busy) return;
    setError("");
    try {
      const pages: PdfPage[] = [];
      for (let page = 1; page <= bulletin.pageCount; page += 1) {
        setProgress(`PDF 만드는 중 (${page}/${bulletin.pageCount})`);
        const response = await fetch(pageUrl(bulletin.id, page, bulletin.version));
        if (!response.ok) throw new Error("PAGE_LOAD_FAILED");
        pages.push(await toJpeg(await response.blob()));
      }
      const bytes = buildPdf(pages, bulletin.title);
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = pdfFileName(bulletin.date);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("PDF를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setProgress("");
    }
  }

  return { busy, progress, error, download };
}
