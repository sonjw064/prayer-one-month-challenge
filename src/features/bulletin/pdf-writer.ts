/**
 * Builds a small PDF from JPEG page images, entirely in the browser (no library).
 * Used for the "PDF로 저장" button: the stored page images are re-packed into a light PDF.
 */
export type PdfPage = { jpeg: Uint8Array; width: number; height: number };

/** A4 width in PDF points; the height follows each image's aspect ratio. */
export const PDF_PAGE_WIDTH = 595.28;

const encoder = new TextEncoder();

function num(value: number): string {
  return value.toFixed(2);
}

/** Title as a UTF-16BE hex string so Korean text is valid in a PDF. */
function pdfTitle(title: string): string {
  let hex = "FEFF";
  for (let i = 0; i < title.length; i += 1) {
    hex += title.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

export function buildPdf(pages: PdfPage[], title = ""): Uint8Array {
  if (pages.length === 0) throw new Error("NO_PAGES");

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, parts: Array<string | Uint8Array>) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    parts.forEach(push);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment

  const pageId = (index: number) => 4 + index * 3;
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, [
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] >>`,
  ]);
  object(3, [title ? `<< /Title ${pdfTitle(title)} /Producer (3D) >>` : "<< /Producer (3D) >>"]);

  pages.forEach((page, index) => {
    const id = pageId(index);
    const width = PDF_PAGE_WIDTH;
    const height = (PDF_PAGE_WIDTH * page.height) / page.width;
    const content = `q ${num(width)} 0 0 ${num(height)} 0 0 cm /Im0 Do Q`;
    object(id, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width)} ${num(height)}] ` +
        `/Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
    ]);
    object(id + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    object(id + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      page.jpeg,
      "\nendstream",
    ]);
  });

  const count = 3 + pages.length * 3;
  const xrefOffset = length;
  let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= count; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${count + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const output = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.length;
  }
  return output;
}
