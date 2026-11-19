/**
 * Browser-only: reads a PDF with the self-hosted pdf.js and renders pages to JPEG images.
 * Pages are rendered one at a time so a very large PDF never needs all its pages in memory.
 */
export const PDFJS_BASE = "/vendor/pdfjs/";
/** Page images are rendered about 1400px wide: sharp on a phone, a few hundred KB each. */
export const TARGET_WIDTH = 1400;
export const MAX_RENDER_HEIGHT = 3000;
export const JPEG_QUALITY = 0.85;

type PdfPageProxy = {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
  cleanup(): void;
};
type PdfDocument = {
  numPages: number;
  getPage(number: number): Promise<PdfPageProxy>;
  destroy(): Promise<void>;
};
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: Record<string, unknown>): { promise: Promise<PdfDocument> };
};

export type RenderedPage = { blob: Blob; width: number; height: number };
export type OpenedPdf = {
  pageCount: number;
  renderPage(pageNumber: number): Promise<RenderedPage>;
  close(): Promise<void>;
};

async function loadPdfJs(): Promise<PdfJs> {
  const url = `${PDFJS_BASE}pdf.min.mjs`;
  // Loaded from our own static files at run time instead of being bundled.
  const pdfjs = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as PdfJs;
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.mjs`;
  return pdfjs;
}

export function renderScale(pageWidth: number, pageHeight: number): number {
  return Math.min(TARGET_WIDTH / pageWidth, MAX_RENDER_HEIGHT / pageHeight);
}

export async function openPdf(file: File): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({
    data,
    cMapUrl: `${PDFJS_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_BASE}standard_fonts/`,
    isEvalSupported: false,
  }).promise;

  return {
    pageCount: pdf.numPages,
    async renderPage(pageNumber) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: renderScale(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("CANVAS_UNAVAILABLE");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      page.cleanup();
      const result = { width: canvas.width, height: canvas.height };
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error("RENDER_FAILED");
      return { blob, ...result };
    },
    close: () => pdf.destroy(),
  };
}
