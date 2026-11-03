import * as XLSX from "xlsx";
import { ATTENDANCE_LABELS } from "./labels";
import type { PersonRecord } from "./stats";
import { formatRate, type AttendanceStats, type GroupTotals, type Totals } from "./stats-types";

type Cell = string | number;

const RATE_FORMAT = "0.0%";

function rate(value: number | null): Cell {
  return value === null ? "-" : value;
}

function totalsColumns(totals: Totals): Cell[] {
  return [
    totals.sessions,
    totals.headcount,
    totals.present,
    totals.absent,
    totals.worshipOnly,
    totals.unchecked,
    rate(totals.presentRate),
    rate(totals.presentRateOfChecked),
    rate(totals.attendRate),
  ];
}

const TOTAL_HEADERS = ["모임 횟수", "전체 인원(연인원)", "출석", "불참", "예배", "미체크", "출석률(전체 인원 기준)", "출석률(체크 인원 기준)", "예배 포함 참석률(전체 인원 기준)"];

/** Percentages are written as numbers with a percent format so Excel can still sort and calculate. */
function sheetOf(rows: Cell[][], rateColumns: number[] = [], filter = true): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 1; r < rows.length; r += 1) {
    for (const c of rateColumns) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = RATE_FORMAT;
    }
  }
  if (filter && rows.length > 0) {
    sheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(rows[0].length - 1)}${rows.length}` };
  }
  sheet["!cols"] = rows[0].map((_, index) => ({ wch: index === 0 ? 16 : 14 }));
  return sheet;
}

function groupRows(groups: GroupTotals[]): Cell[][] {
  return groups.map((group) => [group.name, ...totalsColumns(group.totals)]);
}

export function buildAttendanceWorkbook(stats: AttendanceStats, detail: PersonRecord[]): Buffer {
  const rateCols = (offset: number) => [offset + 6, offset + 7, offset + 8];
  const workbook = XLSX.utils.book_new();

  const summary: Cell[][] = [
    ["항목", "값"],
    ["기간", `${stats.range.from} ~ ${stats.range.to}`],
    ...TOTAL_HEADERS.map((header, index): Cell[] => {
      const value = totalsColumns(stats.totals)[index];
      return [header, typeof value === "number" && index >= 6 ? formatRate(value) : value];
    }),
    ["연속 불참 주의 기준", `${stats.people.threshold}회 이상`],
    ["참고", "기록이 없는 날은 통계에 포함되지 않습니다. 전체 인원은 저장 당시 샘 인원 수입니다."],
  ];
  XLSX.utils.book_append_sheet(workbook, sheetOf(summary, [], false), "요약");

  XLSX.utils.book_append_sheet(
    workbook,
    sheetOf([["월", ...TOTAL_HEADERS], ...stats.monthly.map((m): Cell[] => [m.month, ...totalsColumns(m.totals)])], rateCols(1)),
    "월별",
  );
  XLSX.utils.book_append_sheet(workbook, sheetOf([["마을", ...TOTAL_HEADERS], ...groupRows(stats.villages)], rateCols(1)), "마을별");
  XLSX.utils.book_append_sheet(workbook, sheetOf([["샘", ...TOTAL_HEADERS], ...groupRows(stats.sams)], rateCols(1)), "샘별");
  XLSX.utils.book_append_sheet(
    workbook,
    sheetOf([
      ["이름", "샘", "출석", "불참", "예배", "체크 횟수", "연속 불참", "주의", "마지막 기록일", "최근 메모"],
      ...stats.people.rows.map((p): Cell[] => [p.name, p.samLabel ?? "", p.present, p.absent, p.worshipOnly, p.checked, p.streak, p.alert ? "주의" : "", p.lastDate, p.lastMemo]),
    ]),
    "개인별",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetOf([
      ["날짜", "마을", "샘", "이름", "구분", "메모"],
      ...detail.map((r): Cell[] => [r.date, r.village, r.samName, r.name, ATTENDANCE_LABELS[r.status], r.memo]),
    ]),
    "출석 기록",
  );

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
