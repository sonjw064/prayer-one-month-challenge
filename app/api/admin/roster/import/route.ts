import { NextResponse } from "next/server";
import {
  importRosterUploadBuffer,
  previewRosterUploadBuffer,
  validateRosterUploadMeta,
} from "../../../../../src/features/admin/roster-import-service";
import { requireAdmin } from "../../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../../src/features/auth/http-session";
import { RosterValidationError } from "../../../../../src/features/roster/import";
import { DomainError } from "../../../../../src/lib/http";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json({ code: error.code }, { status: error.status });
  }
  if (error instanceof RosterValidationError) {
    return NextResponse.json({ code: error.message, errors: error.errors }, { status: 400 });
  }

  const code = error instanceof Error ? error.message : "UNKNOWN";
  if (code === "MISSING_ROSTER_ENCRYPTION_KEY") {
    return NextResponse.json({ code }, { status: 503 });
  }
  if (code === "ROSTER_HEADERS_MISSING" || code === "ROSTER_SHEET_MISSING") {
    return NextResponse.json({ code }, { status: 400 });
  }

  throw error;
}

/**
 * Uploads add new people and fill in position/village/sam of existing ones. Nobody is deleted
 * and administrator/active state is never changed.
 * `mode=preview` only reports what would happen; any other value applies the upload.
 * The file is never stored: the browser sends it again to apply.
 */
export async function POST(request: Request) {
  try {
    requireAdmin(await getCurrentSessionUser());

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ code: "ROSTER_FILE_REQUIRED" }, { status: 400 });
    }
    validateRosterUploadMeta({ name: file.name, size: file.size });
    const buffer = Buffer.from(await file.arrayBuffer());

    if (form.get("mode") === "preview") {
      return NextResponse.json({ status: "ok", preview: await previewRosterUploadBuffer({ buffer }) });
    }
    return NextResponse.json({ status: "ok", summary: await importRosterUploadBuffer({ buffer }) });
  } catch (error) {
    return errorResponse(error);
  }
}
