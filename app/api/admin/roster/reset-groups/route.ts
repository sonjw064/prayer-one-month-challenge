import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../../src/features/auth/http-session";
import { assertSameOrigin } from "../../../../../src/features/calendar/input";
import { parseResetRequest } from "../../../../../src/features/sams/registrations-policy";
import { countRosterGroups, resetRosterGroups } from "../../../../../src/features/sams/registrations";
import { DomainError } from "../../../../../src/lib/http";

const noStore = { "cache-control": "private, no-store" };

function fail(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json({ code: error.code }, { status: error.status, headers: noStore });
  }
  throw error;
}

/** Preview: how many roster entries would lose their village/sam. */
export async function GET() {
  try {
    requireAdmin(await getCurrentSessionUser());
    return NextResponse.json({ affected: await countRosterGroups() }, { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}

/** New-year reset of every person's village and sam. Needs the typed confirmation word. */
export async function POST(request: Request) {
  try {
    requireAdmin(await getCurrentSessionUser());
    assertSameOrigin(request);
    parseResetRequest(await request.json().catch(() => null));
    return NextResponse.json({ status: "ok", cleared: await resetRosterGroups() }, { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}
