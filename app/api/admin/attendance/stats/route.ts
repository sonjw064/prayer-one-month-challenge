import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../../src/features/auth/http-session";
import { todayInSeoul } from "../../../../../src/features/challenge/date";
import { parseStatsParams } from "../../../../../src/features/attendance/stats-params";
import { loadAttendanceStats } from "../../../../../src/features/attendance/stats-service";
import { DomainError } from "../../../../../src/lib/http";

/** Attendance statistics contain personal data: administrators only, never cached. */
export async function GET(request: Request) {
  try {
    requireAdmin(await getCurrentSessionUser());
    const filter = parseStatsParams(new URL(request.url).searchParams, todayInSeoul());
    const { stats } = await loadAttendanceStats(filter);
    return NextResponse.json(stats, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ code: error.code }, { status: error.status });
    }
    throw error;
  }
}
