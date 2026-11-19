import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../../src/features/auth/http-session";
import { assertSameOrigin } from "../../../../../src/features/calendar/input";
import { failure } from "../../../../../src/features/bulletin/http";
import { assertBulletinId } from "../../../../../src/features/bulletin/policy";
import { deleteBulletin, setVisibility } from "../../../../../src/features/bulletin/service";
import { DomainError } from "../../../../../src/lib/http";

const noStore = { "cache-control": "private, no-store" };
const visibilitySchema = z.object({ status: z.enum(["published", "hidden"]) });

/** Hide a bulletin from the public or show it again. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(await getCurrentSessionUser());
    assertSameOrigin(request);
    const { id } = await context.params;
    assertBulletinId(id);
    const parsed = visibilitySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DomainError("INVALID_INPUT", 400);
    await setVisibility(id, parsed.data.status);
    return NextResponse.json({ status: "ok" }, { headers: noStore });
  } catch (error) {
    return failure(error, noStore);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(await getCurrentSessionUser());
    assertSameOrigin(request);
    const { id } = await context.params;
    assertBulletinId(id);
    await deleteBulletin(id);
    return NextResponse.json({ status: "ok" }, { headers: noStore });
  } catch (error) {
    return failure(error, noStore);
  }
}
