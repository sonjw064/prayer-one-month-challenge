import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../../../src/features/auth/http-session";
import { assertSameOrigin } from "../../../../../../src/features/calendar/input";
import { failure } from "../../../../../../src/features/bulletin/http";
import { assertBulletinId } from "../../../../../../src/features/bulletin/policy";
import { publishDraft } from "../../../../../../src/features/bulletin/service";
import { sendBulletinPush } from "../../../../../../src/features/push/service";
import { DomainError } from "../../../../../../src/lib/http";

const noStore = { "cache-control": "private, no-store" };
const bodySchema = z.object({ notify: z.boolean().nullish() });

/** Makes a complete draft public. Sends a push notification only when the administrator asked for it. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(await getCurrentSessionUser());
    assertSameOrigin(request);
    const { id } = await context.params;
    assertBulletinId(id);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new DomainError("INVALID_INPUT", 400);

    const bulletin = await publishDraft(id);
    let push: "sent" | "failed" | "skipped" = "skipped";
    if (parsed.data.notify) {
      try {
        await sendBulletinPush({ id: bulletin.id, title: bulletin.title, date: bulletin.date });
        push = "sent";
      } catch {
        // The bulletin is already public even if push delivery is unavailable.
        push = "failed";
      }
    }
    return NextResponse.json({ status: "ok", id: bulletin.id, replaced: bulletin.replaced, push }, { headers: noStore });
  } catch (error) {
    return failure(error, noStore);
  }
}
