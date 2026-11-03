import { NextResponse } from "next/server";
import { listRosterForExport } from "../../../../../src/features/admin/roster-export";
import { buildRosterWorkbook } from "../../../../../src/features/admin/roster-workbook";
import { requireAdmin } from "../../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../../src/features/auth/http-session";
import { todayInSeoul } from "../../../../../src/features/challenge/date";
import { DomainError } from "../../../../../src/lib/http";

export const runtime = "nodejs";

/** Downloads the whole roster as an Excel file. Contains personal data: admin only, never cached or stored. */
export async function GET() {
  try {
    requireAdmin(await getCurrentSessionUser());
    const buffer = buildRosterWorkbook(await listRosterForExport());
    const filename = `삼덕청년부-명단-${todayInSeoul().replace(/-/g, "")}.xlsx`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="roster.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
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
