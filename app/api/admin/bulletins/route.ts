import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../src/features/auth/http-session";
import { assertSameOrigin } from "../../../../src/features/calendar/input";
import { todayInSeoul } from "../../../../src/features/challenge/date";
import { failure } from "../../../../src/features/bulletin/http";
import { parseDraftInput } from "../../../../src/features/bulletin/policy";
import { createDraft, listAdminBulletins, purgeExpiredBulletins } from "../../../../src/features/bulletin/service";

const noStore = { "cache-control": "private, no-store" };

export async function GET() {
  try {
    requireAdmin(await getCurrentSessionUser());
    const today = todayInSeoul();
    // Opening the screen is also when expired bulletins and abandoned drafts are really deleted.
    await purgeExpiredBulletins(today);
    return NextResponse.json({ bulletins: await listAdminBulletins(today), today }, { headers: noStore });
  } catch (error) {
    return failure(error, noStore);
  }
}

/** Starts an upload: creates a draft that stays invisible until it is published. */
export async function POST(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    requireAdmin(user);
    assertSameOrigin(request);
    const today = todayInSeoul();
    const input = parseDraftInput(await request.json().catch(() => null), today);
    await purgeExpiredBulletins(today);
    return NextResponse.json({ status: "ok", id: await createDraft(user.id, input) }, { status: 201, headers: noStore });
  } catch (error) {
    return failure(error, noStore);
  }
}
