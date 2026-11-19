import { describe, expect, it } from "vitest";
import { PDF_PAGE_WIDTH, buildPdf, type PdfPage } from "../../src/features/bulletin/pdf-writer";

// Tiny stand-in "JPEG" payloads: the writer only copies the bytes into DCT streams.
function page(width: number, height: number, size = 40): PdfPage {
  return { jpeg: new Uint8Array(Array.from({ length: size }, (_, i) => (i * 7 + width) % 256)), width, height };
}

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("light PDF writer", () => {
  const pages = [page(1400, 1979), page(1400, 787, 100), page(1000, 1400, 5)];
  const bytes = buildPdf(pages, "주일 주보");
  const text = latin1(bytes);

  it("writes a PDF with header, trailer and the right number of pages", () => {
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain(`/Count ${pages.length}`);
    expect(text.match(/\/Type \/Page /g)).toHaveLength(pages.length);
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(pages.length);
  });

  it("has a cross-reference table whose offsets point at the right objects", () => {
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(3 + pages.length * 3);
    entries.forEach((offset, index) => {
      const expected = `${index + 1} 0 obj`;
      expect(text.slice(offset, offset + expected.length), `object ${index + 1}`).toBe(expected);
    });
    expect(text).toContain(`/Size ${entries.length + 1}`);
  });

  it("keeps every image stream intact and its declared length correct", () => {
    for (const source of pages) {
      expect(text).toContain(`/Width ${source.width} /Height ${source.height}`);
      expect(text).toContain(`/Length ${source.jpeg.length} >>\nstream\n`);
      expect(text).toContain(latin1(source.jpeg));
    }
  });

  it("sizes each page to A4 width and the image's aspect ratio", () => {
    const boxes = [...text.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(boxes).toHaveLength(pages.length);
    boxes.forEach(([width, height], index) => {
      expect(width).toBeCloseTo(PDF_PAGE_WIDTH, 1);
      expect(height).toBeCloseTo((PDF_PAGE_WIDTH * pages[index].height) / pages[index].width, 1);
    });
  });

  it("stores a Korean title as UTF-16BE hex", () => {
    const hex = [..."주일 주보"].map((char) => char.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()).join("");
    expect(text).toContain(`/Title <FEFF${hex}>`);
    expect(latin1(buildPdf(pages))).not.toContain("/Title");
  });

  it("refuses to build an empty PDF", () => {
    expect(() => buildPdf([])).toThrow("NO_PAGES");
  });
});
