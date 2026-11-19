import { weekdayLabel } from "../calendar/month";

/** "2026-11-22" -> "2026. 11. 22 (주일)". Sundays are called 주일. */
export function formatBulletinDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = weekdayLabel(date);
  return `${year}. ${String(month).padStart(2, "0")}. ${String(day).padStart(2, "0")} (${weekday === "일" ? "주일" : weekday})`;
}

export function pageUrl(id: string, page: number, version: string, size: "full" | "thumb" = "full"): string {
  return `/api/bulletins/${id}/pages/${page}?v=${version}${size === "thumb" ? "&size=thumb" : ""}`;
}

export function pdfFileName(date: string): string {
  return `주보-${date}.pdf`;
}
