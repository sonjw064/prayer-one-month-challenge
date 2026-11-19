import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../../../../src/features/auth/http-session";
import { assertSameOrigin } from "../../../../../../../src/features/calendar/input";
import { failure, imageResponse } from "../../../../../../../src/features/bulletin/http";
import { normalizePageImage } from "../../../../../../../src/features/bulletin/image";
import {
  MAX_PAGE_UPLOAD_BYTES,
  assertBulletinId,
  assertImageContentType,
  parsePageNumber,
} from "../../../../../../../src/features/bulletin/policy";
import { getAdminPageImage, savePage } from "../../../../../../../src/features/bulletin/service";
import { DomainError } from "../../../../../../../src/lib/http";

export const runtime = "nodejs";

const noStore = { "cache-control": "private, no-store" };

/** Administrator preview of any page, including drafts. */
export async function GET(request: Request, context: { params: Promise<{ id: string; page: string }> }) {
  try {
    requireAdmin(await getCurrentSessionUser());
    const { id, page } = await context.params;
    assertBulletinId(id);
    const number = parsePageNumber(page);
    const kind = new URL(request.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
    const image = await getAdminPageImage(id, number, kind);
    if (!image) throw new DomainError("PAGE_NOT_FOUND", 404);
    return imageResponse(request, image, `${number}-${kind}`, "private, no-cache");
  } catch (error) {
    return failure(error, noStore);
  }
}

/** Uploads one page image (raw JPEG/PNG/WebP body). The server re-encodes it and makes the thumbnail. */
export async function PUT(request: Request, context: { params: Promise<{ id: string; page: string }> }) {
  try {
    requireAdmin(await getCurrentSessionUser());
    assertSameOrigin(request);
    const { id, page } = await context.params;
    assertBulletinId(id);
    const number = parsePageNumber(page);
    assertImageContentType(request.headers.get("content-type"));
    if (Number(request.headers.get("content-length")) > MAX_PAGE_UPLOAD_BYTES) {
      throw new DomainError("IMAGE_TOO_LARGE", 413);
    }
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length > MAX_PAGE_UPLOAD_BYTES) throw new DomainError("IMAGE_TOO_LARGE", 413);
    await savePage(id, number, await normalizePageImage(bytes));
    return NextResponse.json({ status: "ok", page: number }, { headers: noStore });
  } catch (error) {
    return failure(error, noStore);
  }
}
