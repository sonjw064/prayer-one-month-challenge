import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../../src/features/auth/http-session";
import { todayInSeoul } from "../../../../../src/features/challenge/date";
import { parseStatsParams } from "../../../../../src/features/attendance/stats-params";
import { loadAttendanceStats } from "../../../../../src/features/attendance/stats-service";
import { buildAttendanceWorkbook } from "../../../../../src/features/attendance/stats-workbook";
import { DomainError } from "../../../../../src/lib/http";

export const runtime = "nodejs";

/** Excel download of the same statistics (with per-record detail). Administrators only, never cached or stored. */
export async function GET(request: Request) {
  try {
    requireAdmin(await getCurrentSessionUser());
    const filter = parseStatsParams(new URL(request.url).searchParams, todayInSeoul());
    const { stats, detail } = await loadAttendanceStats(filter);
    const buffer = buildAttendanceWorkbook(stats, detail);
    const filename = `샘출석-${filter.from.replace(/-/g, "")}-${filter.to.replace(/-/g, "")}.xlsx`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="attendance.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ code: error.code }, { status: error.status });
    }
    throw error;
  }
}
