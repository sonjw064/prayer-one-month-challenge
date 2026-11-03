import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../src/features/auth/http-session";
import { assertSameOrigin } from "../../../../src/features/calendar/input";
import { parseRegistrationChange } from "../../../../src/features/sams/registrations-policy";
import {
  changeSams,
  changeVillageLeaders,
  listRegistrations,
} from "../../../../src/features/sams/registrations";
import { DomainError } from "../../../../src/lib/http";

const noStore = { "cache-control": "private, no-store" };

function fail(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json({ code: error.code }, { status: error.status, headers: noStore });
  }
  throw error;
}

export async function GET() {
  try {
    requireAdmin(await getCurrentSessionUser());
    return NextResponse.json(await listRegistrations(), { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}

/** Delete, archive or restore sam / village-head registrations. */
export async function POST(request: Request) {
  try {
    requireAdmin(await getCurrentSessionUser());
    assertSameOrigin(request);
    const change = parseRegistrationChange(await request.json().catch(() => null));
    const result =
      change.kind === "sam"
        ? await changeSams(change.ids, change.action)
        : await changeVillageLeaders(change.ids, change.action);
    return NextResponse.json({ status: "ok", result }, { headers: noStore });
  } catch (error) {
    return fail(error);
  }
}
