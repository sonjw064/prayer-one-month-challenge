import * as XLSX from "xlsx";

/** Columns match the upload parser (and the downloadable example), so an exported file can be uploaded again. */
export const ROSTER_EXPORT_HEADERS = ["이름", "교회직분", "핸드폰", "마을", "샘"] as const;

export type RosterExportRow = {
  name: string;
  position: string | null;
  /** Display form such as 010-1234-5678; kept as text so the leading zero survives. */
  phone: string | null;
  village: string | null;
  sam: string | null;
};

export function buildRosterWorkbook(rows: RosterExportRow[]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...ROSTER_EXPORT_HEADERS],
    ...rows.map((row) => [
      row.name,
      row.position ?? "",
      row.phone ?? "",
      row.village ?? "",
      row.sam ?? "",
    ]),
  ]);
  sheet["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 10 }];
  // Filter buttons on the header row, so the file can be sorted and filtered in Excel.
  sheet["!autofilter"] = { ref: `A1:E${rows.length + 1}` };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "명단");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
